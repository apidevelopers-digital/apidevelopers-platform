import { createHash } from "node:crypto";

function stable(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`undefined field: ${key}`);
      return `${JSON.stringify(key)}:${stable(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`unsupported value type: ${typeof value}`);
}

export function sha256Canonical(value) {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}
