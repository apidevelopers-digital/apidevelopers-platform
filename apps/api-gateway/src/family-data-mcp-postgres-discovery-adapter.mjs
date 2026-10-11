const DEFAULT_TARGET = "family-data-private-postgres-v1";
const DEFAULT_RISK = "R2";
const DEFAULT_ALLOWED_MODE = "read_only";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function asBoolean(value) {
  return Boolean(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function redactEvidenceValue(value) {
  if (value == null) return undefined;
  if (typeof value === "string") {
    return value.length > 0 ? "[present]" : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactEvidenceValue).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|secret|token|key|credential|connection|dsn/i.test(key))
        .map(([key, child]) => [key, redactEvidenceValue(child)])
        .filter(([, child]) => child !== undefined)
    );
  }
  return undefined;
}

function createEmptyEvidence() {
  return Object.freeze({
    vps_status: undefined,
    vps_services: undefined,
    vps_ports: undefined,
    postgres_detect: undefined,
    postgres_backup: undefined,
    gateway_runtime: undefined
  });
}

function summarizeEvidence(evidence) {
  const vpsStatus = evidence.vps_status ?? {};
  const postgresDetect = evidence.postgres_detect ?? {};
  const gatewayRuntime = evidence.gateway_runtime ?? {};
  const backups = evidence.postgres_backup ?? {};

  return Object.freeze({
    vps_present: asBoolean(vpsStatus.present ?? vpsStatus.running ?? vpsStatus.status),
    postgres_detected: asBoolean(postgresDetect.detected),
    postgres_version_present: asBoolean(postgresDetect.version),
    postgres_tls_evidence_present: asBoolean(postgresDetect.tls || postgresDetect.ssl || postgresDetect.tls_required),
    postgres_private_network_evidence_present: asBoolean(
      postgresDetect.private_network || postgresDetect.allowlist || postgresDetect.firewall_group
    ),
    backup_evidence_present: asBoolean(backups.present || safeArray(backups.items).length > 0),
    gateway_runtime_present: asBoolean(gatewayRuntime.present || gatewayRuntime.branch || gatewayRuntime.commit),
    gateway_runtime_current_source_confirmed: asBoolean(gatewayRuntime.current_source_confirmed)
  });
}

function computeGoNoGo(summary) {
  const blockers = [];

  if (!summary.vps_present) blockers.push("vps_not_confirmed");
  if (!summary.postgres_detected) blockers.push("postgres_not_detected");
  if (!summary.postgres_version_present) blockers.push("postgres_version_not_confirmed");
  if (!summary.postgres_tls_evidence_present) blockers.push("postgres_tls_not_confirmed");
  if (!summary.postgres_private_network_evidence_present) blockers.push("postgres_private_network_not_confirmed");
  if (!summary.backup_evidence_present) blockers.push("postgres_backup_not_confirmed");
  if (!summary.gateway_runtime_present) blockers.push("gateway_runtime_not_confirmed");
  if (!summary.gateway_runtime_current_source_confirmed) blockers.push("gateway_runtime_current_source_not_confirmed");

  return Object.freeze({
    decision: blockers.length === 0 ? "GO_FOR_APPROVAL_PACKAGE" : "NO_GO",
    blockers: Object.freeze(blockers)
  });
}

export function createFamilyDataMcpDiscoveryAdapter({
  callTool,
  target = DEFAULT_TARGET,
  risk = DEFAULT_RISK,
  allowedMode = DEFAULT_ALLOWED_MODE
} = {}) {
  if (typeof callTool !== "function") {
    throw new TypeError("callTool function is required");
  }

  async function safeCall(tool, args = {}) {
    const response = await callTool(tool, {
      ...args,
      dry_run: true,
      mode: "read_only"
    });

    return redactEvidenceValue(response);
  }

  async function collectEvidence() {
    const evidence = { ...createEmptyEvidence() };

    evidence.vps_status = await safeCall("vps.status", { target });
    evidence.vps_services = await safeCall("vps.services.list", { target });
    evidence.vps_ports = await safeCall("vps.ports.list", { target });
    evidence.postgres_detect = await safeCall("postgres.detect", { target });
    evidence.postgres_backup = await safeCall("postgres.backup.status", { target });
    evidence.gateway_runtime = await safeCall("gateway.runtime.status", { target });

    const summary = summarizeEvidence(evidence);
    const goNoGo = computeGoNoGo(summary);

    return Object.freeze({
      source: "family_data_mcp_discovery_adapter_v1",
      target,
      risk,
      allowed_mode: allowedMode,
      dry_run: true,
      read_only: true,
      performs_mutation: false,
      executes_shell: false,
      reads_credentials: false,
      connects_to_database: false,
      evidence: Object.freeze(evidence),
      summary,
      decision: goNoGo.decision,
      blockers: goNoGo.blockers
    });
  }

  return Object.freeze({
    target,
    risk,
    allowed_mode: allowedMode,
    collectEvidence
  });
}

export function planFamilyDataMcpDiscoveryAdapter({ availableTools = [] } = {}) {
  const requiredTools = Object.freeze([
    "vps.status",
    "vps.services.list",
    "vps.ports.list",
    "postgres.detect",
    "postgres.backup.status",
    "gateway.runtime.status"
  ]);

  const available = new Set(safeArray(availableTools));
  const missingTools = requiredTools.filter((tool) => !available.has(tool));

  return Object.freeze({
    source: "family_data_mcp_discovery_adapter_plan_v1",
    target: DEFAULT_TARGET,
    risk: DEFAULT_RISK,
    required_tools: requiredTools,
    missing_tools: Object.freeze(missingTools),
    ready: missingTools.length === 0,
    dry_run: true,
    read_only: true,
    performs_mutation: false,
    executes_shell: false,
    reads_credentials: false,
    connects_to_database: false
  });
}
