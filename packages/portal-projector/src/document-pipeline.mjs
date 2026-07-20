import { canonicalSerialize, sha256 } from "./index.mjs";
import { parsePortalMarkdown, validateInternalMarkdownLinks } from "./markdown-parser.mjs";

export class PortalDocumentPipelineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalDocumentPipelineError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalDocumentPipelineError(code, message, details);
}

function assertReader(reader) {
  if (!reader || typeof reader !== "object") {
    fail("PORTAL_DOCUMENT_PIPELINE_READER_INVALID", "reader must be an object");
  }
  if (typeof reader.list !== "function" || typeof reader.readMany !== "function") {
    fail("PORTAL_DOCUMENT_PIPELINE_READER_INVALID", "reader must expose list and readMany");
  }
  if (reader.mutationAllowed !== false) {
    fail("PORTAL_DOCUMENT_PIPELINE_MUTATION_FORBIDDEN", "reader must be explicitly read-only");
  }
  if (typeof reader.commit !== "string" || !/^[0-9a-f]{40}$/i.test(reader.commit)) {
    fail("PORTAL_DOCUMENT_PIPELINE_COMMIT_INVALID", "reader must expose a full commit SHA");
  }
}

function normalizePrefixes(prefixes) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    fail("PORTAL_DOCUMENT_PIPELINE_PREFIXES_INVALID", "prefixes must be a non-empty array");
  }
  const normalized = [...new Set(prefixes)];
  for (const prefix of normalized) {
    if (typeof prefix !== "string" || prefix === "" || prefix.startsWith("/") || prefix.includes("..") || prefix.includes("\\")) {
      fail("PORTAL_DOCUMENT_PIPELINE_PREFIX_INVALID", "prefix must be repository-relative and normalized", { prefix });
    }
  }
  return normalized.sort((a, b) => a.localeCompare(b));
}

function documentRecord(document, checksum) {
  return Object.freeze({
    id: `portal-document:${document.path}`,
    type: "portal_document",
    path: document.path,
    title: document.title,
    headings: document.headings,
    links: document.links,
    yamlBlocks: document.yamlBlocks,
    sourceRef: Object.freeze({
      commit: document.commit,
      path: document.path,
      checksum,
    }),
  });
}

export async function projectPortalDocuments({
  reader,
  prefixes = ["docs/architecture/PORTAL_DATA_MODEL.md", "docs/architecture/portal"],
  parse = parsePortalMarkdown,
  validateLinks = validateInternalMarkdownLinks,
  schemaVersion = "portal.document-projection/v1",
  projectorVersion = "0.1.0",
} = {}) {
  assertReader(reader);
  if (typeof parse !== "function" || typeof validateLinks !== "function") {
    fail("PORTAL_DOCUMENT_PIPELINE_ADAPTER_INVALID", "parse and validateLinks must be functions");
  }

  const selectedPrefixes = normalizePrefixes(prefixes);
  const listed = [];
  for (const prefix of selectedPrefixes) {
    const entries = await reader.list(prefix);
    for (const path of entries) {
      if (path === prefix || path.startsWith(`${prefix}/`)) listed.push(path);
    }
  }

  const paths = [...new Set(listed)]
    .filter((path) => path.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  if (paths.length === 0) {
    fail("PORTAL_DOCUMENT_PIPELINE_EMPTY", "no Portal Markdown documents found", { prefixes: selectedPrefixes });
  }

  const blobs = await reader.readMany(paths);
  if (!Array.isArray(blobs) || blobs.length !== paths.length) {
    fail("PORTAL_DOCUMENT_PIPELINE_READ_INVALID", "reader returned an unexpected document set");
  }

  const byPath = new Map(blobs.map((blob) => [blob.path, blob]));
  const documents = [];
  for (const path of paths) {
    const blob = byPath.get(path);
    if (!blob || blob.commit !== reader.commit || typeof blob.content !== "string" || typeof blob.checksum !== "string") {
      fail("PORTAL_DOCUMENT_PIPELINE_READ_INVALID", "document read is incomplete or belongs to another commit", { path });
    }
    documents.push(parse({ path, commit: reader.commit, content: blob.content }));
  }

  const findings = documents
    .flatMap((document) => validateLinks(document, paths))
    .sort((a, b) =>
      String(a.sourcePath).localeCompare(String(b.sourcePath)) ||
      Number(a.line ?? 0) - Number(b.line ?? 0) ||
      String(a.target).localeCompare(String(b.target))
    );

  if (findings.length > 0) {
    fail("PORTAL_DOCUMENT_PIPELINE_LINKS_INVALID", "internal Markdown links are invalid", { findings });
  }

  const records = documents.map((document) => {
    const blob = byPath.get(document.path);
    return documentRecord(document, blob.checksum);
  });

  const logical = Object.freeze({
    schemaVersion,
    sourceRepository: reader.repository,
    sourceCommit: reader.commit,
    projectorVersion,
    documentCount: records.length,
    records: Object.freeze(records),
  });

  return Object.freeze({
    ...logical,
    contentChecksum: sha256(canonicalSerialize(logical)),
  });
}

export function createPortalDocumentPipeline(options = {}) {
  return Object.freeze({
    project: (reader) => projectPortalDocuments({ ...options, reader }),
    mutationAllowed: false,
  });
}
