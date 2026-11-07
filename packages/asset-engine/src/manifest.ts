import type { AssetCatalog, AssetRecord, PublishReport } from './types';

export const APPROVED_ORIGINAL_CONTRACT_VERSION = 'approved-original-v1';

const finalStates = new Set(['approved', 'published', 'verified']);

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
    record.original?.sha256 || record.sha1 || record.sha256 || 'no_hash',
  ].join(':');
}

export function validateApprovedOriginalContract(record: AssetRecord): string[] {
  const errors: string[] = [];
  const policyRequiresOriginal =
    record.canonical_policy === 'approved-original' || finalStates.has(record.status);

  if (!policyRequiresOriginal) {
    return errors;
  }

  if (!record.original) {
    errors.push('canonical_original_required');
  }

  if (record.original && record.original.kind !== 'approved_original') {
    errors.push('canonical_original_kind_invalid');
  }

  if (record.original && record.original.exact_bytes_required !== true) {
    errors.push('canonical_original_exact_bytes_required');
  }

  if (record.original && !record.original.sha256) {
    errors.push('canonical_original_missing_sha256');
  }

  if (
    record.status === 'published' || record.status === 'verified'
  ) {
    const hasStoredOriginal = Boolean(
      record.original?.public_url ||
        record.original?.remote_path ||
        record.original?.storage?.remote_path ||
        record.original?.storage?.key
    );

    if (!hasStoredOriginal) {
      errors.push('canonical_original_missing_storage');
    }
  }

  if (record.sha256 && record.original?.sha256 && record.sha256 !== record.original.sha256) {
    errors.push('record_sha256_must_match_canonical_original');
  }

  if (record.public_url && record.original?.public_url && record.public_url !== record.original.public_url) {
    errors.push('public_url_must_point_to_canonical_original_or_explicit_derivative');
  }

  const derivatives = record.derivatives || {};
  for (const [name, derivative] of Object.entries(derivatives)) {
    if (!record.original?.sha256) {
      errors.push(`derivative_without_canonical_original:${name}`);
      continue;
    }

    if (derivative.kind !== 'derivative') {
      errors.push(`derivative_kind_invalid:${name}`);
    }

    if (derivative.derived_from_sha256 !== record.original.sha256) {
      errors.push(`derivative_source_hash_mismatch:${name}`);
    }
  }

  return errors;
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
