import { createHash, timingSafeEqual } from "node:crypto";

export function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );
}

export function extractApiKey(headers = {}) {
  const normalized = normalizeHeaders(headers);
  const direct = normalized["x-api-key"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const authorization = normalized.authorization;
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function secureCompareSecrets(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftDigest = createHash("sha256").update(left "utf8").digest("hex");