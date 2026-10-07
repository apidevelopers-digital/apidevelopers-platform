#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'media/catalogs/hiddenarquives/greys.json');
const manifestPath = path.join(root, 'artifacts/asset-engine/dry-run/hiddenarquives-greys-dry-run-manifest.json');
const outputPath = path.join(root, 'artifacts/asset-engine/dry-run/hiddenarquives-greys-index.html');

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function card(asset) {
  return `<figure class="visual-card">
  <img src="${esc(asset.public_url)}" alt="${esc(asset.title)}">
  <figcaption>
    <h3>${esc(asset.title)}</h3>
    <p>${esc(asset.caption)}</p>
  </figcaption>
</figure>`;
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (!manifest.ok) {
  throw new Error(`manifest_not_ok:${(manifest.errors || []).join(',')}`);
}

const hero = manifest.assets.find((asset) => asset.role === 'hero') || manifest.assets[0];
const cards = manifest.assets.filter((asset) => asset !== hero);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(catalog.title)} | Hidden Arquives</title>
  <meta name="description" content="${esc(catalog.claimsPolicy)}">
  <link rel="stylesheet" href="https://hiddenarquives.tech/assets/ha-core.css?v=3">
  <!-- generated-by: ADA Asset Engine dry-run renderer -->
  <!-- tenant: ${esc(catalog.tenant)} project: ${esc(catalog.project)} -->
  <style>
    .asset-engine-preview{padding:32px;max-width:1180px;margin:auto}
    .hero-preview{width:100%;max-height:520px;object-fit:cover;border-radius:28px}
    .visual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
    .visual-card{border:1px solid #ffffff22;border-radius:24px;overflow:hidden;background:#ffffff08}
    .visual-card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#071018}
    .visual-card figcaption{padding:18px}
    @media(max-width:820px){.visual-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="asset-engine-preview">
    <section class="hero theme-entity">
      <p class="eyebrow">Species file / generated asset-engine preview</p>
      <h1>${esc(catalog.title)}</h1>
      <p class="lead">${esc(catalog.claimsPolicy)}</p>
      ${hero ? `<img class="hero-preview" src="${esc(hero.public_url)}" alt="${esc(hero.title)}">` : ''}
    </section>
    <section id="catalog" class="section">
      <p class="eyebrow">Generated visual catalog</p>
      <h2>${esc(catalog.title)} panels</h2>
      <div class="visual-grid">
${cards.map(card).join('\n')}
      </div>
    </section>
  </main>
</body>
</html>
`;

if (html.includes('ha-https://')) {
  throw new Error('rendered_html_contains_broken_ha_https');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);

console.log(JSON.stringify({
  ok: true,
  output: path.relative(root, outputPath),
  cards: cards.length,
  hero: Boolean(hero)
}, null, 2));
