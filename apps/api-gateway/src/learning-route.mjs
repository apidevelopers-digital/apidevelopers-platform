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
  getLearningScreen,
  adminKey,
} = {}) {
  if (typeof getLearningScreen !== "function") {
    throw new TypeError("getLearningScreen must be a function");
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

      const screen = await getLearningScreen();
      return json(200, {
        data: structuredClone(screen),
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

export function withLearningRoute({
  app,
  getLearningScreen,
  adminKey,
} = {}) {
  if (!app || typeof app.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  const learningRoute = createLearningRoute({
    getLearningScreen,
    adminKey,
  });

  return Object.freeze({
    async handleRequest(request) {
      const learningResponse = await learningRoute.handleRequest(request);
      if (learningResponse) return learningResponse;
      return app.handleRequest(request);
    },
  });
}
