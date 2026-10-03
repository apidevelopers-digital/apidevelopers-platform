export const ACTION_PARITY_STATUS = Object.freeze({
  MIGRATE_TO_GATEWAY: "migrate_to_gateway",
  OUT_OF_SCOPE: "out_of_scope"
});

export const ADA_ACTION_PARITY_MATRIX = Object.freeze([
  { capability: "github", currentInterface: "GitHub Action", futureInterface: "ADA Gateway github.* + MCP", status: ACTION_PARITY_STATUS.MIGRATE_TO_GATEWAY },
  { capability: "hostinger", currentInterface: "Hostinger/operator Actions", futureInterface: "ADA Gateway hostinger.* + MCP", status: ACTION_PARITY_STATUS.MIGRATE_TO_GATEWAY },
  { capability: "meta_whatsapp_cloud", currentInterface: "Meta Graph/WhatsApp Cloud Actions", futureInterface: "ADA Gateway meta.* + MCP", status: ACTION_PARITY_STATUS.MIGRATE_TO_GATEWAY },
  { capability: "vnnox", currentInterface: "VNNOX Actions", futureInterface: "ADA Gateway vnnox.* + MCP", status: ACTION_PARITY_STATUS.MIGRATE_TO_GATEWAY },
  { capability: "operator", currentInterface: "operator-central", futureInterface: "ADA Gateway operator.* + approval queue", status: ACTION_PARITY_STATUS.MIGRATE_TO_GATEWAY },
  { capability: "peterle_mitra", currentInterface: "Peterle/Mitra Actions", futureInterface: "ADA Gateway mitra.* + peterle.* + MCP", status: ACTION_PARITY_STATUS.MIGRATE_TO_GATEWAY },
  { capability: "wati", currentInterface: "WATI Action", futureInterface: null, status: ACTION_PARITY_STATUS.OUT_OF_SCOPE },
  { capability: "media_studio", currentInterface: "planned/undefined", futureInterface: null, status: ACTION_PARITY_STATUS.OUT_OF_SCOPE },
  { capability: "claude", currentInterface: "none", futureInterface: "optional future provider adapter", status: ACTION_PARITY_STATUS.OUT_OF_SCOPE }
]);

export const listParityMatrix = () => ADA_ACTION_PARITY_MATRIX;
