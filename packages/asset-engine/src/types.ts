export type AssetType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'brand'
  | 'campaign'
  | 'vnnox-package';

export type AssetStatus =
  | 'draft'
  | 'uploaded'
  | 'processed'
  | 'approved'
  | 'published'
  | 'verified'
  | 'failed'
  | 'archived'
  | 'rejected';

export type AssetChannel =
  | 'hostinger-site'
  | 'cdn-storage'
  | 'whatsapp'
  | 'email'
  | 'vnnox'
  | 'meta-social';

export type AssetCanonicalPolicy = 'approved-original';

export type AssetFileKind =
  | 'approved_original'
  | 'derivative'
  | 'source_part'
  | 'manifest'
  | 'publish_plan';

export type AssetDerivativePurpose =
  | 'web'
  | 'hero'
  | 'card'
  | 'thumb'
  | 'mobile'
  | 'whatsapp'
  | 'email'
  | 'vnnox'
  | 'campaign'
  | 'preview';

export interface AssetRecord {
  asset_id: string;
  tenant: string;
  project: string;
  type: AssetType;
  role: string;
  status: AssetStatus;
  sha1?: string;
  sha256?: string;
  public_url?: string;
  storage?: AssetStorage;

  /**
   * Canonical policy for human-approved media.
   *
   * When set to "approved-original", the approved file itself is the source
   * of truth and derivatives can never replace it.
   */
  canonical_policy?: AssetCanonicalPolicy;
  original?: AssetCanonicalOriginal;
  derivatives?: Record<string, AssetDerivative>;

  /**
   * Legacy/compatibility variants. Use derivatives for new manifests.
   */
  variants?: Record<string, AssetVariant>;
  usage?: string[];
  audit?: AssetAudit;
}

export interface AssetCanonicalOriginal {
  kind: 'approved_original';
  approved: boolean;
  exact_bytes_required: true;
  filename?: string;
  source_path?: string;
  public_url?: string;
  remote_path?: string;
  storage?: AssetStorage;
  mime?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  sha1?: string;
  sha256: string;
}

export interface AssetDerivative {
  kind: 'derivative';
  purpose: AssetDerivativePurpose;
  derived_from_sha256: string;
  public_url?: string;
  remote_path?: string;
  storage?: AssetStorage;
  mime?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  sha1?: string;
  sha256?: string;
  transformation?: {
    resize?: string;
    format?: string;
    quality?: number;
    notes?: string;
  };
}

export interface AssetVariant {
  variant: string;
  public_url?: string;
  remote_path?: string;
  mime?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  sha1?: string;
  sha256?: string;
}

export interface AssetStorage {
  provider: 'hostinger' | 'r2' | 's3' | 'cdn' | 'local';
  remote_path?: string;
  bucket?: string;
  key?: string;
}

export interface AssetAudit {
  created_at?: string;
  created_by?: string;
  approved_at?: string;
  approved_by?: string;
  published_at?: string;
  published_by?: string;
  verified_at?: string;
  verified_by?: string;
}

export interface AssetCatalogItem {
  role: string;
  title: string;
  source: string;
  caption?: string;
  order?: number;
}

export interface AssetCatalog {
  tenant: string;
  project: string;
  title: string;
  theme?: string;
  claimsPolicy?: string;
  poweredBy?: string;
  images: AssetCatalogItem[];
}

export interface PublishReport {
  ok: boolean;
  tenant: string;
  project: string;
  channel: AssetChannel;
  assets_total?: number;
  assets_published?: number;
  assets_verified?: number;
  http_200?: number;
  html_updated?: boolean;
  html_verified?: boolean;
  rollback_available?: boolean;
  errors?: string[];
}
