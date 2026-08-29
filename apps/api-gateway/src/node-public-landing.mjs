const HOST = "gateway.apidevelopers.digital";

function normalizeHost(value) {
  return String(value ?? "").trim().toLowerCase().split(":")[0];
}

export function renderGatewayPublicLanding() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>API Gateway — API Developers.digital</title>
<style>
:root{color-scheme:dark;background:#090b10;color:#f4f7fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#172033 0,#090b10 55%)}
main{width:min(760px,calc(100% - 32px));padding:48px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(15,20,31,.82);box-shadow:0 24px 80px rgba(0,0,0,.35)}
.brand{font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#a9b7cc}.badge{display:inline-flex;gap:8px;align-items:center;margin-top:24px;padding:8px 12px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:#cdd8e8;font-size:13px}
.dot{width:8px;height:8px;border-radius:50%;background:#59d98e;box-shadow:0 0 18px rgba(89,217,142,.55)}
h1{font-size:clamp(38px,7vw,68px);line-height:1;margin:18px 0 10px}h2{margin:0;color:#c4cede;font-size:20px;font-weight:500}
p{max-width:62ch;color:#aeb9c9;line-height:1.7;font-size:17px;margin:26px 0 0}
footer{margin-top:42px;padding-top:22px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;color:#778397;font-size:13px}
</style>
</head>
<body><main>
<div class="brand">API Developers.digital</div>
<h1>API Gateway</h1>
<h2>Operational Gateway</h2>
<p>Gateway operacional da plataforma para composição governada de contratos, serviços, identidade, confiança e integrações.</p>
<div class="badge"><span class="dot"></span>Serviço operacional</div>
<footer><span>Ambiente: production</span><span>Superfície pública segura</span></footer>
</main></body></html>`;
}

export function maybeHandleGatewayPublicLanding(request, response) {
  const method = String(request?.method ?? "GET").toUpperCase();
  const url = new URL(String(request?.url ?? "/"), "http://gateway.local");
  const host = normalizeHost(request?.headers?.host);

  if (method !== "GET" || url.pathname !== "/" || host !== HOST) return false;

  const html = renderGatewayPublicLanding();
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
  response.end(html);
  return true;
}
