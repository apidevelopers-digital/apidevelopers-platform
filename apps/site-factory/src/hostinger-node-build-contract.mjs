export const HOSTINGER_NODE_BUILD_REQUIRED_TRANSPORT = "application/json";

export function assertHostingerNodeBuildArchiveContract({
  transport,
  archiveRepresentationVerified = false,
} = {}) {
  if (transport !== "documented-json-filename") {
    throw new Error(
      "hostinger_node_archive_contract_requires_application_json",
    );
  }

  if (archiveRepresentationVerified !== true) {
    throw new Error("hostinger_node_archive_representation_unverified");
  }

  return Object.freeze({
    transport: "documented-json-filename",
    contentType: HOSTINGER_NODE_BUILD_REQUIRED_TRANSPORT,
    archiveRepresentationVerified: true,
  });
}
