import type { AssetCatalog, AssetRecord, PublishReport } from './types';

export function createAssetId(asset: Pick<AssetRecord, 'tenant' | 'project' | 'role' | 'sha1'>): string {
  const base = [asset.tenant, asset.project, asset.role, asset.sha1?.slice(0, 8)]
    .filter(Boolean)
    .join('_')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toLowerCase();

  return `ast_${base}`;
}

export function buildAssetSignature(record: AssetRecord): string {
  return [
    record.asset_id,
    record.tenant,
    record.project,
    record.type,
    record.role,
    record.sha1 || record.sha256 || 'no_hash',
  ].join(':');
}

export function createBasicPublishReport(args: {
  tenant: string;
  project: string;
  channel: PublishReport['channel'];
  ok?: boolean;
}): PublishReport {
  return {
    ok: args.ok ?? true,
    tenant: args.tenant,
    project: args.project,
    channel: args.channel,
    assets_total: 0,
    assets_published: 0,
    assets_verified: 0,
    http_200: 0,
    html_updated: false,
    html_verified: false,
    rollback_available: false,
  };
}

export function validateCatalogBasics(catalog: AssetCatalog): string[] {
  const errors: string[] = [];

  if (!catalog.tenant) {
    errors.push('missing_tenant');
  }

  if (!catalog.project) {
    errors.push('missing_project');
  }

  if (!catalog.title) {
    errors.push('missing_title');
  }

  if (!Array.isArray(catalog.images)) {
    errors.push('images_not_array');
  }

  return errors;
}
