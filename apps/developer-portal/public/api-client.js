
export class ReadApiClient {
  constructor({ baseUrl, apiKey = "" }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  async get(path) {
    const headers = { accept: "application/json" };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers,
      credentials: "omit",
      cache: "no-store",
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
      throw error;
    }
    return payload;
  }

  institutionalSnapshot() {
    return this.get("/v1/portal/snapshot");
  }

  learningSnapshot() {
    return this.get("/v1/admin/learning");
  }
}
