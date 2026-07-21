import path from "node:path";
import { globToRegExp, matchesPatterns, normalizeRepositoryPath } from "./repository.mjs";

function clone(value){ return structuredClone(value); }
function selectTargets(rule,targets){
  const include=rule?.appliesTo?.include??["**"];
  const exclude=rule?.appliesTo?.exclude??[];
  return [...new Set(targets.map(normalizeRepositoryPath))]
    .filter((target)=>matchesPatterns(target,include,exclude))
    .sort();
}
function createFinding(rule,data){
  return {
    path:data.path??"",
    location:data.location??{line:null,column:null},
    observed:clone(data.observed??null),
    expected:clone(data.expected??null),
    message:data.message??rule.message,
    remediation:data.remediation??rule.remediation,
    sourceRefs:[...(rule.sourceRefs??[])].sort(),
    metadata:clone(data.metadata??{}),
  };
}
function parseRegex(specification){
  if(typeof specification==="string") return new RegExp(specification,"u");
  if(specification&&typeof specification==="object"&&typeof specification.source==="string"){
    const flags=String(specification.flags??"u").replaceAll("g","").replaceAll("y","");
    return new RegExp(specification.source,flags.includes("u")?flags:`${flags}u`);
  }
  throw new TypeError("Pattern must be a string or { source, flags }.");
}
function regexMatches(pattern,text){
  pattern.lastIndex=0;
  const matched=pattern.test(text);
  pattern.lastIndex=0;
  return matched;
}
function regexExec(text,pattern){
  pattern.lastIndex=0;
  const match=pattern.exec(text);
  pattern.lastIndex=0;
  return match;
}
function findLocation(text,index){
  const prefix=text.slice(0,index);
  const lines=prefix.split("\n");
  return {line:lines.length,column:lines.at(-1).length+1};
}
function jsonPointerGet(document,pointer){
  if(pointer==="") return {found:true,value:document};
  if(typeof pointer!=="string"||!pointer.startsWith("/")) throw new TypeError("JSON pointer must be empty or start with '/'.");
  let current=document;
  for(const rawPart of pointer.slice(1).split("/")){
    const part=rawPart.replaceAll("~1","/").replaceAll("~0","~");
    if(current===null||typeof current!=="object"||!Object.prototype.hasOwnProperty.call(current,part))
      return {found:false,value:undefined};
    current=current[part];
  }
  return {found:true,value:current};
}
async function readJson(readText,filePath){
  const text=await readText(filePath);
  try{ return JSON.parse(text); }catch(error){
    const wrapped=new TypeError(`Invalid JSON target: ${filePath}`);
    wrapped.cause=error;
    throw wrapped;
  }
}
function ensureIo(io){
  if(typeof io?.readText!=="function") throw new TypeError("Built-in adapters require readText().");
  if(typeof io?.exists!=="function") throw new TypeError("Built-in adapters require exists().");
}

export function createBuiltinAdapters(io){
  ensureIo(io);
  return Object.freeze({
    async "required-path"({rule,targets}){
      const findings=[];
      const exactPaths=rule?.parameters?.paths??[];
      for(const expectedPath of exactPaths.map(normalizeRepositoryPath).sort()){
        if(!(await io.exists(expectedPath))) findings.push(createFinding(rule,{
          path:expectedPath,observed:{exists:false},expected:{exists:true},
        }));
      }
      const forEach=rule?.parameters?.forEach;
      const relativePaths=rule?.parameters?.relativePaths??[];
      if(forEach){
        const selector=globToRegExp(forEach);
        const anchors=[...new Set(targets.map(normalizeRepositoryPath))].filter((target)=>selector.test(target)).sort();
        for(const anchor of anchors){
          const directory=path.posix.dirname(anchor);
          for(const relativePath of [...relativePaths].sort()){
            const expectedPath=normalizeRepositoryPath(path.posix.join(directory,relativePath));
            if(!(await io.exists(expectedPath)))findings.push(createFinding(rule,{
              path:expectedPath,observed:{exists:false,anchor},expected:{exists:true,relativeTo:anchor},
            }));
          }
        }
      }
      return findings;
    },
    async "required-field"({rule,targets}){
      const findings=[];
      const pointer=rule?.parameters?.pointer??"";
      const expectedValue=rule?.parameters?.equals;
      const expectedPattern=rule?.parameters?.pattern?parseRegex(rule.parameters.pattern):null;
      for(const target of selectTargets(rule,targets)){
        const document=await readJson(io.readText,target);
        const observed=jsonPointerGet(document,pointer);
        const matchesValue=expectedValue===undefined||Object.is(observed.value,expectedValue);
        const matchesPattern=!expectedPattern||(typeof observed.value==="string"&&regexMatches(expectedPattern,observed.value));
        if(!observed.found||!matchesValue||!matchesPattern)findings.push(createFinding(rule,{
          path:target,observed:{found:observed.found,value:observed.found?observed.value:null},
          expected:{pointer,...(expectedValue===undefined?{}:{equals:expectedValue}),...(rule?.parameters?.pattern?{pattern:rule.parameters.pattern}:{})},
        }));
      }
      return findings;
    },
    async "allowed-value"({rule,targets}){
      const findings=[];
      const pointer=rule?.parameters?.pointer??"";
      const values=rule?.parameters?.values??[];
      for(const target of selectTargets(rule,targets)){
        const document=await readJson(io.readText,target);
        const observed=jsonPointerGet(document,pointer);
        if(!observed.found||!values.some((value)=>Object.is(value,observed.value)))findings.push(createFinding(rule,{
          path:target,observed:observed.found?observed.value:null,expected:{pointer,allowedValues:clone(values)},
        }));
      }
      return findings;
    },
    async "required-pattern"({rule,targets}){
      const findings=[];
      const patterns=(rule?.parameters?.patterns??[]).map(parseRegex);
      for(const target of selectTargets(rule,targets)){
        const text=await io.readText(target);
        for(const [index,pattern] of patterns.entries()){
          if(!regexMatches(pattern,text))findings.push(createFinding(rule,{
            path:target,observed:{present:false,patternIndex:index},expected:{present:true,patternIndex:index},
          }));
        }
      }
      return findings;
    },
    async "forbidden-pattern"({rule,targets}){
      const findings=[];
      const patterns=(rule?.parameters?.patterns??[]).map(parseRegex);
      for(const target of selectTargets(rule,targets)){
        const text=await io.readText(target);
        for(const [index,pattern] of patterns.entries()){
          const match=regexExec(text,pattern);
          if(match)findings.push(createFinding(rule,{
            path:target,location:findLocation(text,match.index),observed:{present:true,patternIndex:index},expected:{present:false,patternIndex:index},
          }));
        }
      }
      return findings;
    },
  });
}
