const CLOSED_BOOTSTRAP_ROUTE = "/v1/operator/hostinger/mysql/unijuri-staging/create-bootstrap";

const RESPONSE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
});

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function createOperatorHostingerMysqlStagingHandoffHttpApp({ app } = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest is required");

  return Object.freeze({
    async handleRequest(request = {}) {
      const parsedUrl = new URL(request.url ?? "/", "https://api-gateway.local");
      const path = parsedUrl.pathname;

      if (path === CLOSED_BOOTSTRAP_ROUTE) {
        return jsonResponse(410, {
          ok: false,
          error: "bootstrap_route_closed",
          database: "ujstg",
          user: "ujstg",
          databaseLogicalName: "unijuri_staging",
          userLogicalName: "unijuri_staging",
          productionChanged: false,
          secretReturned: false,
        });
      }

      return app.handleRequest(request);
    },
  });
}
