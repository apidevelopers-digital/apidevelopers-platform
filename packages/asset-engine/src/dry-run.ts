import type { AssetCatalog, AssetCatalogItem, AssetRecord, PublishReport } from './types';
import { createAssetId, createBasicPublishReport, validateCatalogBasics } from './manifest';

export interface DryRunOptions {
  publicBaseUrl: string;
  assetsPath: string;
  defaultHash?: string;
}

export interface DryRunManifestItem {
  source: string;
  filename: string;
  public_url: string;
  role: string;
  title: string;
  caption?: string;
  asset_id: string;
  sha1: string;
}

export interface DryRunManifest {
  ok: boolean;
  tenant: string;
  project: string;
  title: string;
  mode: 'dry-run';
  errors: string[];
  assets: DryRunManifestItem[];
  report: PublishReport;
}

function sanitizeFragment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fileExtension(source: string): string {
  const match = source.match(/\.(png|jpg|jpeg|webp|avif)$/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

function normalizePath(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildDryRunAsset(catalog: AssetCatalog, item: AssetCatalogItem, options: DryRunOptions): DryRunManifestItem {
  const hash = options.defaultHash ?? 'dryrun000000';
  const shortHash = hash.slice(0, 8);
  const base = sanitizeFragment(`${catalog.project}-${item.role}-${item.title}`);
  const ext = fileExtension(item.source);
  const filename = `${base}-${shortHash}.${ext}`;
  const publicUrl = `${options.publicBaseUrl.replace(/\/+$/, '')}/${normalizePath(options.assetsPath)}/${filename}`;

  const assetRecord: AssetRecord = {
    asset_id: '',
    tenant: catalog.tenant,
    project: catalog.project,
    type: 'image',
    role: item.role,
    status: 'processed',
    sha1: hash,
    public_url: publicUrl,
  };

  assetRecord.asset_id = createAssetId(assetRecord);

  return {
    source: item.source,
    filename,
    public_url: publicUrl,
    role: item.role,
    title: item.title,
    caption: item.caption,
    asset_id: assetRecord.asset_id,
    sha1: hash,
  };
}

export function generateDryRunManifest(catalog: AssetCatalog, options: DryRunOptions): DryRunManifest {
  const errors = validateCatalogBasics(catalog);
  const assets = errors.length === 0
    ? catalog.images
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item) => buildDryRunAsset(catalog, item, options))
    : [];

  const report = createBasicPublishReport({
    tenant: catalog.tenant ?? 'unknown',
    project: catalog.project ?? 'unknown',
    channel: 'hostinger-site',
    ok: errors.length === 0,
  });

  report.assets_total = assets.length;
  report.assets_published = 0;
  report.assets_verified = 0;
  report.html_updated = false;
  report.html_verified = false;
  report.errors = errors;

  return {
    ok: errors.length === 0,
    tenant: catalog.tenant,
    project: catalog.project,
    title: catalog.title,
    mode: 'dry-run',
    errors,
    assets,
    report,
  };
}
