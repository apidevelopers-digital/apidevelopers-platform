import{MitraProfessionalError,requiredText,safeFacts,text}from"./mitra-professional-common.mjs";
const TYPES=new Set(["contract","petition","appeal","motion","agreement","legal_brief","other"]);
const NAMES={contract:"Contrato — rascunho para revisão",petition:"Petição — rascunho para revisão",appeal:"Recurso — rascunho para revisão",motion:"Manifestação — rascunho para revisão",agreement:"Acordo — rascunho para revisão",legal_brief:"Memorial jurídico — rascunho para revisão",other:"Documento jurídico — rascunho para revisão"};
function citation(row={}){
 const item=row&&typeof row==="object"?row:{};let url="";
 try{const candidate=String(item.source_url??item.sourceUrl??item.url??"").trim();if(candidate){const parsed=new URL(candidate);if(parsed.protocol==="https:")url=parsed.toString()}}catch{}
 return Object.freeze({title:text(item.title??item.titulo??"Fonte",300),source:text(item.source??item.provider??"Fonte pública",180),source_url:url,citation:text(item.citation??item.citacao??item.reference??"",1_000),summary:text(item.summary??item.resumo??"",1_500)});
}
function citations(value){
 if(value===undefined||value===null)return[];
 if(!Array.isArray(value))throw new MitraProfessionalError(400,"citations_array_required","citations deve ser uma lista.");
 return value.slice(0,20).map(citation);
}
export function buildProfessionalDocumentPreview(payload={}){
 const type=text(payload.documentType??payload.document_type,80).toLowerCase().replace(/[\s-]+/g,"_");
 if(!TYPES.has(type))throw new MitraProfessionalError(400,"document_type_invalid","Tipo de documento não suportado.");
 const objective=requiredText(payload.objective,"objective",4_000),instructions=text(payload.instructions,4_000),facts=safeFacts(payload.facts),refs=citations(payload.citations);
 const factLines=facts.length?facts.map((fact,i)=>`${i+1}. ${typeof fact==="string"?fact:JSON.stringify(fact)}`).join("\n"):"Nenhum fato foi estruturado nesta prévia.";
 const refLines=refs.length?refs.map((item,i)=>{const ref=item.citation||item.title||item.source,url=item.source_url?` — ${item.source_url}`:"";return`[${i+1}] ${ref}${url}`}).join("\n"):"Nenhuma fonte foi anexada. Antes do uso profissional, acrescente e confira fontes oficiais.";
 const content=[NAMES[type].toUpperCase(),"","OBJETIVO",objective,"","FATOS INFORMADOS",factLines,"","PONTOS PARA DESENVOLVIMENTO E REVISÃO",instructions||"Estruture fundamentos apenas a partir de fontes oficiais verificadas e dos fatos informados.","","FONTES E CITAÇÕES",refLines,"","NOTA DE REVISÃO","Este conteúdo é um rascunho estrutural. Não constitui conclusão jurídica final e exige revisão humana antes de uso, assinatura, protocolo ou envio."].join("\n");
 return Object.freeze({ok:true,status:"draft_preview",document_type:type,title:NAMES[type],content,citations:refs,citation_count:refs.length,persistence:false,database_write_allowed:false,write_executed:false,human_review_required:true,final_legal_conclusion_disabled:true,no_invention_policy:true});
}
