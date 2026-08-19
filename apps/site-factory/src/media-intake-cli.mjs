#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { applyMediaIntake, prepareMediaIntake } from "./media-assets-github.mjs";
import { MEDIA_DEFAULTS } from "./media-assets-core.mjs";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") { out.apply = true; continue; }
    if (a === "--help") { out.help = true; continue; }
    if (!a.startsWith("--")) throw new Error(`unexpected_argument:${a}`);
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`missing_value:${a}`);
    out[key] = value;
  }
  return out;
}
function need(name, value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_argument:${name}`);
  return value.trim();
}
function help() {
  return [
    "Uso:",
    "  node src/media-intake-cli.mjs \\",
    "    --source /caminho/imagem.webp \\",
    "    --surface public-site --collection factory --role reference \\",
    "    --slug nome-estavel --date AAAA-MM-DD \\",
    '    --source-type generated --provenance "Imagem gerada pela ADA" [--apply]',
    "",
    "Sem --apply: dry-run. Com --apply: cria/reutiliza branch e Draft PR no acervo canônico.",
  ].join("\n");
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.help) { console.log(help()); return; }
  const source = need("source", a.source);
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("missing_environment:GITHUB_TOKEN");
  const mediaBuffer = await readFile(source);
  const spec = {
    repository: a.repository ?? MEDIA_DEFAULTS.repository,
    baseBranch: a.baseBranch ?? MEDIA_DEFAULTS.baseBranch,
    sourceName: basename(source),
    surface: need("surface", a.surface),
    collection: need("collection", a.collection),
    date: need("date", a.date),
    role: need("role", a.role),
    slug: need("slug", a.slug),
    status: a.status ?? "candidate",
    sourceType: a.sourceType ?? "generated",
    provenance: need("provenance", a.provenance),
    width: a.width,
    height: a.height,
    usageSurface: a.usageSurface,
    usageRepository: a.usageRepository,
    usagePr: a.usagePr,
  };
  const result = a.apply
    ? await applyMediaIntake({ token, mediaBuffer, spec })
    : await prepareMediaIntake({ token, mediaBuffer, spec });
  const safe = { ...result };
  delete safe._internal;
  console.log(JSON.stringify(safe, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.message || error),
    hint: "Nenhum segredo é exibido. Use --help para o formato esperado.",
  }, null, 2));
  process.exitCode = 1;
});
