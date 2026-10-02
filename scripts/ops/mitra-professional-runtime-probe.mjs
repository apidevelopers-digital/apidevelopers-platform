const {
  EXPECTED_DEPLOY_SHA = "",
  GATEWAY_ORIGIN = "https://gateway.apidevelopers.digital",
  GH_TOKEN = "",
  PROBE_ORIGIN = "https://mitra-preview.apidevelopers.digital",
} = process.env;

const REF_URL =
  "https://api.github.com/repos/apidevelopers-digital/apidevelopers-platform/git/ref/heads/deploy/hostinger-gateway-runtime";
const PREFIX = "MITRA_PROFESSIONAL_RUNTIME_PROBE_";

function out(key, value) {
  console.log(`${PREFIX}${key}=${String(value ?? "")}`);
}

function safe(value, max = 180) {
  return String(value ?? "unmapped")
    .slice(0, max)
    .replace(/[^a-zA-Z0-9_.:/|,-]/g, "_");
}

function safeKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "none";
  return Object.keys(value).sort().map((key) => safe(key, 80)).join("|") || "none";
}

function fail(message) {
  out("FAILURE", safe(message, 240));
  process.exitCode = 1;
}

function secretScan(text) {
  const value = String(text || "").toLowerCase();
  for (const marker of [
    "authorization",
    "bearer ",
    "cookie",
    "password",
    "private_key",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "x-api-key",
    "x-tenant-id",
  ]) {
    if (value.includes(marker)) fail(`secret_like_text_${safe(marker.trim(), 80)}`);
  }
}

async function checkRef() {
  if (!EXPECTED_DEPLOY_SHA) fail("missing_EXPECTED_DEPLOY_SHA");
  if (!GH_TOKEN) fail("missing_GH_TOKEN");

  const response = await fetch(REF_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${GH_TOKEN}`,
      "x-github-api-version": "2022-11-28",
    },
  });

  out("GITHUB_REF_HTTP_STATUS", response.status);
  if (!response.ok) {
    fail(`github_ref_http_${response.status}`);
    return;
  }

  const payload = await response.json();
  const sha = payload?.object?.sha || "";
  out("DEPLOY_SHA", sha);
  if (sha !== EXPECTED_DEPLOY_SHA) fail(`deploy_sha_mismatch_${sha}`);
}

async function request(path, options = {}) {
  let response;
  let text = "";

  try {
    response = await fetch(new URL(path, GATEWAY_ORIGIN), {
      method: options.method || "GET",
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(PROBE_ORIGIN ? { origin: PROBE_ORIGIN } : {}),
        "user-agent": "apidevelopers-platform/mitra-professional-runtime-probe",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    text = await response.text();
  } catch (error) {
    fail(`fetch_failed_${safe(error?.name)}`);
    return { status: 0, body: null };
  }

  secretScan(text);

  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    fail(`invalid_json_${safe(path)}_${response.status}`);
  }

  return { status: response.status, body };
}

async function health() {
  const { status, body } = await request("/v1/mitra/professional/health");

  out("HEALTH_HTTP_STATUS", status);
  out("HEALTH_OK", body?.ok === true);
  out("HEALTH_SERVICE", safe(body?.service || "none"));
  out("HEALTH_STATUS", safe(body?.status || body?.error || "none"));
  out("HEALTH_ASSISTANT", safe(body?.capabilities?.assistant));
  out("HEALTH_JURIMETRICS", safe(body?.capabilities?.jurimetrics));
  out("HEALTH_VERITAS", safe(body?.capabilities?.veritas));
  out("HEALTH_DOCUMENTS", safe(body?.capabilities?.documents));

  if (![200, 503].includes(status)) fail(`health_unexpected_http_${status}`);
  if (body?.service !== "mitra-professional") fail(`health_unexpected_service_${safe(body?.service)}`);
}

async function documentPreview() {
  const { status, body } = await request("/v1/mitra/professional/document/preview", {
    method: "POST",
    body: {
      documentType: "legal_brief",
      objective: "Preparar rascunho estrutural para avaliação profissional da Mitra.",
      facts: [
        "Probe operacional seguro da Mitra Profissional.",
        "Não executar escrita nem persistência.",
      ],
      instructions: "Gerar apenas preview efêmero com revisão humana obrigatória.",
      citations: [
        {
          title: "Probe Mitra Profissional",
          source: "apidevelopers-platform",
          citation: "runtime professional probe",
          source_url: "https://gateway.apidevelopers.digital/v1/mitra/professional/health",
        },
      ],
    },
  });

  out("DOCUMENT_PREVIEW_HTTP_STATUS", status);
  out("DOCUMENT_PREVIEW_OK", body?.ok === true);
  out("DOCUMENT_PREVIEW_STATUS", safe(body?.status || body?.error || "none"));
  out("DOCUMENT_PREVIEW_TYPE", safe(body?.document_type || "none"));
  out("DOCUMENT_PREVIEW_WRITE_EXECUTED", body?.write_executed === true);

  if (status !== 200 || body?.ok !== true) {
    fail(`document_preview_failed_${status}_${safe(body?.error || body?.status)}`);
  }
  if (body?.persistence !== false || body?.write_executed !== false || body?.human_review_required !== true) {
    fail("document_preview_safety_contract_failed");
  }
  if (!String(body?.content || "").includes("NOTA DE REVIS")) {
    fail("document_preview_content_missing_review_note");
  }
}

async function configuredOnlyRoute(path, payload, label) {
  const result = await request(path, { method: "POST", body: payload });

  out(`${label}_HTTP_STATUS`, result.status);
  out(`${label}_OK`, result.body?.ok === true);
  out(`${label}_ERROR`, safe(result.body?.error || "none"));
  out(`${label}_MESSAGE`, safe(result.body?.message || "none", 220));
  out(`${label}_STATUS`, safe(result.body?.status || "none"));
  out(`${label}_PAYLOAD_KEYS`, safeKeys(payload));
  out(`${label}_RESPONSE_KEYS`, safeKeys(result.body));
  out(`${label}_RESULT_KEYS`, safeKeys(result.body?.result || result.body?.data));
  out(`${label}_WRITE_EXECUTED`, result.body?.write_executed === true);

  if (![200, 503].includes(result.status)) {
    fail(`${label.toLowerCase()}_unexpected_http_${result.status}`);
  }
  if (result.status === 503 && result.body?.error !== "professional_upstream_not_configured") {
    fail(`${label.toLowerCase()}_unexpected_503_${safe(result.body?.error)}`);
  }
  if (result.body?.write_executed === true || result.body?.database_write_allowed === true) {
    fail(`${label.toLowerCase()}_unsafe_write_flag`);
  }
}

async function main() {
  if (GATEWAY_ORIGIN !== "https://gateway.apidevelopers.digital") {
    fail("unexpected_gateway_origin");
  }

  out("GATEWAY_ORIGIN", safe(GATEWAY_ORIGIN));
  out("PROBE_ORIGIN", safe(PROBE_ORIGIN));

  await checkRef();
  await health();
  await documentPreview();

  await configuredOnlyRoute(
    "/v1/mitra/professional/analyze",
    {
      question: "Quais pontos jurídicos precisam de pesquisa pública antes de uma conclusão profissional?",
      facts: ["Probe operacional da Mitra Profissional."],
      tribunal: "STJ",
      limit: 3,
    },
    "ANALYZE",
  );

  await configuredOnlyRoute(
    "/v1/mitra/professional/jurimetrics",
    {
      tribunal: "STJ",
      query: "direito civil",
      limit: 3,
    },
    "JURIMETRICS",
  );

  await configuredOnlyRoute(
    "/v1/mitra/professional/veritas",
    {
      mode: "claim_precheck",
      claim: "Probe seguro para verificar se a camada Veritas está configurada.",
      evidence: {
        source: "runtime probe",
        note: "sem persistência",
      },
    },
    "VERITAS",
  );

  if (process.exitCode) process.exit(process.exitCode);
  out("RESULT", "mitra_professional_runtime_probe_passed");
}

await main();
