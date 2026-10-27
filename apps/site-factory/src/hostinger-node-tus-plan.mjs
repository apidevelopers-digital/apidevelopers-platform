// Hostinger Node archive upload/build request planning (no network I/O).
// All write execution remains disabled until a separately reviewed executor is approved.
import { serializeHostingerNodeStartBuildDryRun } from "./hostinger-node-start-build-dry-run.mjs";

const API = "/api/hosting/v1";
const required = (value, name) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name}`);
  return value.trim();
};
export function assertHostingerNodeWriteAuthorization() {
  throw new Error("hostinger_node_write_blocked:executor_not_approved");
}
export function planHostingerNodeArchiveUpload({ username, domain, archivePath, startBuildInput } = {}) {
  const account = required(username, "username");
  const site = required(domain, "domain");
  const archive = required(archivePath, "archive_path");
  // Reject silent whitespace normalization and invalid TUS destination paths even
  // for legacy previews without a complete StartBuildRequest.
  if (archive !== archivePath) throw new Error("invalid_archive_path");
  if (archive.length > 200 ||
      !/^[a-zA-Z0-9_./-]+$/.test(archive) ||
      archive.split("/").some((part) => !part || part === "." || part === "..") ||
      !/\.(zip|tgz|tar\.gz)$/i.test(archive)) {
    throw new Error("invalid_archive_path");
  }
  // No implicit defaults for the StartBuildRequest: the caller must explicitly
  // provide the complete, validated contract body. The legacy preview stays inert.
  const buildPreview = startBuildInput === undefined ? null :
    serializeHostingerNodeStartBuildDryRun(startBuildInput);
  if (buildPreview && buildPreview.body.source_options.archive_path !== archive) {
    throw new Error("archive_path_mismatch");
  }
  return Object.freeze({
    mode: "dry-run",
    writesEnabled: false,
    uploadUrlRequest: Object.freeze({
      method: "POST",
      path: `${API}/files/upload-urls`,
      body: Object.freeze({ username: account, domain: site })
    }),
    buildRequest: Object.freeze({
      method: "POST",
      path: `${API}/accounts/${encodeURIComponent(account)}/websites/${encodeURIComponent(site)}/nodejs/builds`,
      source_type: "archive",
      source_options: Object.freeze({ archive_path: archive }),
      ...(buildPreview ? { body: buildPreview.body } : {})
    }),
    buildPayloadValidated: Boolean(buildPreview),
    tusUploadRequired: true,
    buildStartAllowed: false
  });
}
