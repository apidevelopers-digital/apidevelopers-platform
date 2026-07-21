import { normalizeInstitutional, normalizeLearning } from "./contracts.js";

export class ReadApiClient {
  constructor({ baseUrl, apiKey = "", timeoutMs = 8000 }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = Number.isFinite(timeoutMs) ? Math.max(100, timeoutMs) : 8000;
  }

  async get(path, { signal = null } = {}) {
    const headers = { accept: "application/json" };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("TIMEOUT"), this.timeoutMs);
    const onAbort = () => controller.abort(signal?.reason || "CANCELLED");
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers,
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const code = payload?.error?.code || payload?.code || `HTTP_${response.status}`;
        const error = new Error(code);
        error.status = response.status;
        error.payload = payload;
        error.retryable = response.status >= 500;
        throw error;
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted && !error.status) {
        const timedOut = controller.signal.reason === "TIMEOUT";
        const abortError = new Error(timedOut ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED");
        abortError.status = timedOut ? 504 : 499;
        abortError.retryable = timedOut;
        throw abortError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  async institutionalSnapshot(options = {}) {
    return normalizeInstitutional(await this.get("/v1/portal/snapshot", options));
  }

  async learningSnapshot(options = {}) {
    return normalizeLearning(await this.get("/v1/admin/learning", options));
  }
}
