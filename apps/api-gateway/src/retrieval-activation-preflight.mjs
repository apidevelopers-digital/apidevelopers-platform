function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new TypeError(`${field} is required`);
    error.code = "RETRIEVAL_PREFLIGHT_INVALID_ARGUMENT";
    throw error;
  }
  return value.trim();
}

function asBoolean(value) {
  return value === true;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function normalizeProbeResult(name, value) {
  if (!value || typeof value !== "object") {
    return freeze({
      name,
      ok: false,
      readOnly: false,
      secretsExposed: false,
      contentRead: false,
      writesPerformed: false,
      reason: "invalid_probe_response",
    });
  }

  return freeze({
    name,
    ok: value.ok === true,
    readOnly: value.readOnly === true || value.read_only === true,
    secretsExposed: value.secretsExposed === true || value.secrets_exposed === true,
    contentRead: value.contentRead === true || value.content_read === true,
    writesPerformed: value.writesPerformed === true || value.writes_performed === true,
    reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : null,
  });
}

export function createRetrievalActivationPreflight({
  getKillSwitchState,
  audit,
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof getKillSwitchState !== "function") {
    const error = new TypeError("getKillSwitchState function is required");
    error.code = "RETRIEVAL_PREFLIGHT_DEPENDENCY_REQUIRED";
    throw error;
  }
  if (typeof audit !== "function") {
    const error = new TypeError("audit function is required");
    error.code = "RETRIEVAL_PREFLIGHT_DEPENDENCY_REQUIRED";
    throw error;
  }

  async function run({
    tenantId,
    retrievalEnabled = false,
    runtime,
    providerProbes = {},
  } = {}) {
    const tenant = requiredText(tenantId, "tenantId");
    const observedAt = clock();

    const blockers = [];
    const providers = [];

    if (!asBoolean(retrievalEnabled)) {
      blockers.push("feature_flag_disabled");
    }

    if (!runtime || runtime.enabled !== true || runtime.status !== "ready") {
      blockers.push("runtime_not_ready");
    }

    const killSwitch = await getKillSwitchState({ tenantId: tenant });
    if (!killSwitch || typeof killSwitch !== "object") {
      blockers.push("kill_switch_state_unavailable");
    } else if (killSwitch.enabled === true) {
      blockers.push("kill_switch_enabled");
    }

    if (blockers.length === 0) {
      for (const [name, probe] of Object.entries(providerProbes)) {
        if (typeof probe !== "function") {
          providers.push(normalizeProbeResult(name, null));
          blockers.push(`provider_${name}_invalid_probe`);
          continue;
        }

        let normalized;
        try {
          normalized = normalizeProbeResult(name, await probe({ tenantId: tenant }));
        } catch {
          normalized = normalizeProbeResult(name, { ok: false, reason: "probe_failed" });
        }
        providers.push(normalized);

        if (!normalized.ok) blockers.push(`provider_${name}_unhealthy`);
        if (!normalized.readOnly) blockers.push(`provider_${name}_not_read_only`);
        if (normalized.secretsExposed) blockers.push(`provider_${name}_secret_exposure`);
        if (normalized.contentRead) blockers.push(`provider_${name}_content_read_during_preflight`);
        if (normalized.writesPerformed) blockers.push(`provider_${name}_write_during_preflight`);
      }
    }

    const uniqueBlockers = [...new Set(blockers)];
    const result = freeze({
      contractType: "RetrievalActivationPreflight",
      contractVersion: "1.0",
      tenantId: tenant,
      observedAt,
      ready: uniqueBlockers.length === 0,
      blockers: uniqueBlockers,
      providers,
      retrievalEnabled: asBoolean(retrievalEnabled),
      runtimeReady: Boolean(runtime?.enabled === true && runtime?.status === "ready"),
      killSwitchBlocking: Boolean(killSwitch?.enabled === true),
      sensitiveContentIncluded: false,
    });

    try {
      await audit(freeze({
        event: "retrieval.activation.preflight",
        timestamp: observedAt,
        tenantId: tenant,
        ready: result.ready,
        blockerCount: result.blockers.length,
        providerCount: providers.length,
        providerNames: providers.map((item) => item.name),
        sensitiveContentIncluded: false,
      }));
    } catch (error) {
      const failure = new Error("retrieval activation preflight audit failed");
      failure.code = "RETRIEVAL_PREFLIGHT_AUDIT_FAILED";
      failure.cause = error;
      throw failure;
    }

    return result;
  }

  return Object.freeze({ run });
}
