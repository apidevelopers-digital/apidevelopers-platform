export interface AssetWorkerJob {
  job_id: string;
  kind: 'process' | 'publish' | 'inject' | 'verify';
  tenant: string;
  project: string;
  asset_ids?: string[];
}

export interface AssetWorkerResult {
  ok: boolean;
  job_id: string;
  errors?: string[];
}

export async function runAssetWorkerJob(job: AssetWorkerJob): Promise<AssetWorkerResult> {
  return {
    ok: false,
    job_id: job.job_id,
    errors: ['not_implemented'],
  };
}
