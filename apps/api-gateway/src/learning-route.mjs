function json(status, payload) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function readHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

export function createLearningRoute({
  repository,
  adminKey,
} = {}) {
  if (!repository || typeof repository.getLatest !== "function") {
    throw new TypeError("repository.getLatest must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

      if (method !== "GET" || pathname !== "/v1/admin/learning") {
        return null;
      }

      const suppliedKey = readHeader(request.headers, "x-api-key");
      if (!adminKey || suppliedKey !== adminKey) {
        return json(401, {
          error: "unauthorized",
          message: "Administrative credential is required.",
        });
      }

      const snapshot = await repository.getLatest();
      if (!snapshot) {
        return json(503, {
          error: "learning_snapshot_unavailable",
          message: "No published learning snapshot is available.",
        });
      }

      return json(200, {
        data: structuredClone(snapshot),
        meta: {
          readOnly: true,
          mutationAllowed: false,
          executionAllowed: false,
          automaticApprovalAllowed: false,
        },
      });
    },
  });
}

export function withLearningRoute({ app, repository, adminKey } = {}) {
  if (!app || typeof app.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  const route = createLearningRoute({ repository, adminKey });

  return Object.freeze({
    async handleRequest(request) {
      const response = await route.handleRequest(request);
      if (response) return response;
      return app.handleRequest(request);
    },
  });
}
