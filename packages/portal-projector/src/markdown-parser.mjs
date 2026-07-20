
export class PortalMarkdownParserError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalMarkdownParserError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalMarkdownParserError(code, message, details);
}

function slugify(value) {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "[]") return [];
  if (value === "{}") return {};
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, "");
}

export function parseSimpleYaml(text) {
  const result = {};
  const stack = [{ indent: -1, value: result }];
  for (const [index, rawLine] of text.replace(/\r\n?/g, "\n").split("\n").entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (rawLine.includes("\t")) fail("PORTAL_MARKDOWN_YAML_INVALID", "tabs are not allowed", { line: index + 1 });
    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;
    if (line.startsWith("- ")) {
      if (!Array.isArray(parent)) fail("PORTAL_MARKDOWN_YAML_INVALID", "list item without list parent", { line: index + 1 });
      parent.push(parseScalar(line.slice(2)));
      continue;
    }
    const match = line.match(/^([^:]+):(.*)$/);
    if (!match) fail("PORTAL_MARKDOWN_YAML_INVALID", "unsupported yaml line", { line: index + 1 });
    const key = match[1].trim();
    const tail = match[2].trim();
    if (Object.hasOwn(parent, key)) fail("PORTAL_MARKDOWN_YAML_DUPLICATE_KEY", `duplicate key: ${key}`, { line: index + 1 });
    if (tail === "") {
      const nextLine = text.replace(/\r\n?/g, "\n").split("\n").slice(index + 1).find((candidate) => candidate.trim());
      const container = nextLine?.trimStart().startsWith("- ") ? [] : {};
      parent[key] = container;
      stack.push({ indent, value: container });
    } else {
      parent[key] = parseScalar(tail);
    }
  }
  return result;
}

export function parsePortalMarkdown({ path, commit, content }) {
  if (typeof path !== "string" || !path.endsWith(".md")) fail("PORTAL_MARKDOWN_PATH_INVALID", "path must be a markdown file");
  if (!/^[0-9a-f]{40}$/i.test(commit ?? "")) fail("PORTAL_MARKDOWN_COMMIT_INVALID", "commit must be a full SHA");
  if (typeof content !== "string") fail("PORTAL_MARKDOWN_CONTENT_INVALID", "content must be UTF-8 text");

  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const headings = [];
  const links = [];
  const codeBlocks = [];
  let fence = null;
  let buffer = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fenceMatch) {
      if (fence) {
        codeBlocks.push(Object.freeze({
          language: fence.language,
          content: buffer.join("\n"),
          startLine: fence.startLine,
          endLine: index + 1,
        }));
        fence = null; buffer = [];
      } else {
        fence = { language: fenceMatch[1].toLowerCase(), startLine: index + 1 };
      }
      continue;
    }
    if (fence) { buffer.push(line); continue; }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[2].trim();
      headings.push(Object.freeze({
        level: heading[1].length,
        title,
        anchor: slugify(title),
        line: index + 1,
      }));
    }

    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      links.push(Object.freeze({ text: match[1], target: match[2], line: index + 1 }));
    }
  }

  if (fence) fail("PORTAL_MARKDOWN_UNCLOSED_FENCE", "unclosed code fence", { line: fence.startLine });

  const title = headings.find((item) => item.level === 1);
  if (!title) fail("PORTAL_MARKDOWN_TITLE_MISSING", "document must contain one level-1 title");
  if (headings.filter((item) => item.level === 1).length !== 1) fail("PORTAL_MARKDOWN_TITLE_INVALID", "document must contain exactly one level-1 title");

  const yamlBlocks = codeBlocks
    .filter((block) => block.language === "yaml" || block.language === "yml")
    .map((block) => Object.freeze({ ...block, value: Object.freeze(parseSimpleYaml(block.content)) }));

  return Object.freeze({
    schemaVersion: "portal.markdown-document/v1",
    path,
    commit,
    title: title.title,
    headings: Object.freeze(headings),
    links: Object.freeze(links),
    codeBlocks: Object.freeze(codeBlocks),
    yamlBlocks: Object.freeze(yamlBlocks),
  });
}

export function validateInternalMarkdownLinks(document, availablePaths) {
  const paths = new Set(availablePaths);
  const findings = [];
  const base = document.path.split("/").slice(0, -1);
  for (const link of document.links) {
    const rawTarget = link.target.split("#")[0];
    if (!rawTarget || /^[a-z]+:/i.test(rawTarget)) continue;
    const segments = [...base, ...rawTarget.split("/")];
    const normalized = [];
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") normalized.pop();
      else normalized.push(segment);
    }
    const target = normalized.join("/");
    if (!paths.has(target)) findings.push(Object.freeze({
      code: "PORTAL_MARKDOWN_LINK_MISSING",
      sourcePath: document.path,
      target,
      line: link.line,
    }));
  }
  return Object.freeze(findings);
}
