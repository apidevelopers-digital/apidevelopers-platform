import { RISK, APPROVAL } from "./risk-policy.mjs";

export const ADA_MCP_MANIFEST = Object.freeze({
  name: "ADA Gateway MCP Core",
  version: "1.0.0-draft",
  owner: "API Developers.digital",
  sourceOfTruth: {
    provider: "github",
    organization: "apidevelopers-digital",
    repositories: ["apidevelopers-institution", ".github", "apidevelopers-platform"]
  },
  activeCapabilities: ["github", "hostinger", "meta", "whatsapp_cloud", "vnnox", "operator", "uni", "mitra", "peterle"],
  excludedCapabilities: {
    wati: "retired from active scope",
    media_studio: "not developed",
    claude: "not required for current migration"
  },
  interfaceStrategy: {
    primaryInterface: "ChatGPT/ADA",
    gatewayFirst: true,
    mcpFuture: true,
    avoidModelApiForInternalOps: true
  },
  safety: {
    defaultReadRisk: RISK.R1,
    mutationApproval: APPROVAL.IGOR_EXPLICIT,
    secretsNeverReturned: true,
    dryRunBeforeWrite: true
  }
});
