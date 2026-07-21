import assert from "node:assert/strict";
import {
  PORTAL_CONFIG,
  resolvePortalConfig,
  validateGatewayUrl,
} from "../public/gateway-config.js";

assert.deepEqual(
  validateGatewayUrl("http://127.0.0.1:3000/", PORTAL_CONFIG),
  { ok: true, code: "GATEWAY_OK", url: "http://127.0.0.1:3000" },
);

const production = {
  allowedGatewayOrigins: ["https://api.example.com"],
};

assert.deepEqual(
  validateGatewayUrl("https://api.example.com", production),
  { ok: true, code: "GATEWAY_OK", url: "https://api.example.com" },
);

const scenarios = [
  ["not-a-url", "GATEWAY_URL_INVALID"],
  ["https://user:pass@api.example.com", "GATEWAY_CREDENTIALS_FORBIDDEN"],
  ["https://api.example.com?token=x", "GATEWAY_SUFFIX_FORBIDDEN"],
  ["https://api.example.com/path", "GATEWAY_PATH_FORBIDDEN"],
  ["http://api.example.com", "GATEWAY_PROTOCOL_FORBIDDEN"],
  ["https://other.example.com", "GATEWAY_ORIGIN_FORBIDDEN"],
];

for (const [input, code] of scenarios) {
  const result = validateGatewayUrl(input, production);
  assert.equal(result.ok, false, input);
  assert.equal(result.code, code, input);
  assert.equal(result.url, null, input);
}

const resolved = resolvePortalConfig({
  environment: "production",
  defaultGatewayUrl: "https://api.example.com/",
  allowedGatewayOrigins: ["https://api.example.com"],
  timeoutMs: 99999,
});

assert.equal(resolved.environment, "production");
assert.equal(resolved.defaultGatewayUrl, "https://api.example.com");
assert.equal(resolved.timeoutMs, 30000);
assert.equal(resolved.valid, true);
assert.equal(Object.isFrozen(resolved.allowedGatewayOrigins), true);

const invalid = resolvePortalConfig({
  defaultGatewayUrl: "https://forbidden.example.com",
  allowedGatewayOrigins: ["https://api.example.com"],
  timeoutMs: 10,
});

assert.equal(invalid.valid, false);
assert.equal(invalid.errorCode, "GATEWAY_ORIGIN_FORBIDDEN");
assert.equal(invalid.defaultGatewayUrl, "");
assert.equal(invalid.timeoutMs, 1000);

console.log("developer-portal gateway environment policy: ok");
