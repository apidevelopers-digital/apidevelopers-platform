import type { AssetCatalog } from './types';
import type { DryRunManifest, DryRunManifestItem } from './dry-run';

export interface SpeciesPageRenderOptions {
  titleSuffix?: string;
  stylesheetUrl?: string;
}

function escapeHtml(value: string | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderCard(item: DryRunManifestItem): string {
  return [
    '<figure class="visual-card">',
    `  <img src="${escapeHtml(item.public_url)}" alt="${escapeHtml(item.title)}">`,
    '  <figcaption>',
    `    <h3>${escapeHtml(item.title)}</h3>`,
    `    <p>${escapeHtml(item.caption)}</p>`,
    '  </figcaption>',
    '</figure>',
  ].join('\n');
}

export function renderSpeciesPage(catalog: AssetCatalog, manifest: DryRunManifest, options: SpeciesPageRenderOptions = {}): string {
  const hero = manifest.assets.find((asset) => asset.role === 'hero') ?? manifest.assets[0];
  const cards = manifest.assets.filter((asset) => asset !== hero);
  const stylesheetUrl = options.stylesheetUrl ?? 'https://hiddenarquives.tech/assets/ha-core.css?v=3';
  const titleSuffix = options.titleSuffix ?? 'Hidden Arquives';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(catalog.title)} | ${escapeHtml(titleSuffix)}</title>
  <meta name="description" content="${escapeHtml(catalog.claimsPolicy)}">
  <link rel="stylesheet" href="${escapeHtml(stylesheetUrl)}">
  <!-- generated-by: ADA Asset Engine dry-run renderer -->
</head>
<body>
  <main>
    <section class="hero theme-entity">
      <div class="shell">
        <p class="eyebrow">Species file / generated asset-engine preview</p>
        <h1>${escapeHtml(catalog.title)}</h1>
        <p class="lead">${escapeHtml(catalog.claimsPolicy)}</p>
        ${hero ? `<img class="hero-preview" src="${escapeHtml(hero.public_url)}" alt="${escapeHtml(hero.title)}">` : ''}
      </div>
    </section>
    <section id="catalog" class="section">
      <div class="shell">
        <p class="eyebrow">Generated visual catalog</p>
        <h2 class="group-title">${escapeHtml(catalog.title)} panels</h2>
        <div class="visual-grid">
 ${cards.map(renderCard).join('\n')}
        </div>
      </div>
    </section>
  </main>
</body>
</html>
`;
}
