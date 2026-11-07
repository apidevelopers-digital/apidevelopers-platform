import type { AssetCatalog, AssetRecord, PublishReport } from './types';

export interface AssetPublishTarget {
  channel: PublishReport['channel'];
  tenant: string;
  project: string;
  destination: string;
}

export interface AssetPublisher {
  readonly channel: PublishReport['channel'];
  publish(records: AssetRecord[], target: AssetPublishTarget): Promise<PublishReport>;
}

export interface AssetVerifier {
  verify(report: PublishReport): Promise<PublishReport>;
}

export interface AssetInjector {
  inject(catalog: AssetCatalog, target: AssetPublishTarget): Promise<PublishReport>;
}

export interface HostingerStaticTarget extends AssetPublishTarget {
  channel: 'hostinger-site';
  remoteRoot: string;
  publicBaseUrl: string;
  subdomainPath?: string;
}

export function assertNoSecretsInReport(report: PublishReport): void {
  const serialized = JSON.stringify(report).toLowerCase();
  const forbidden = ['password', 'secret', 'token', 'bearer ', 'api_key', 'private_key'];

  for (const word of forbidden) {
    if (serialized.includes(word)) {
      throw new Error(`unsafe_report_contains_${word.replace(/\W+/g, '_')}`);
    }
  }
}
