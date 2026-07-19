export const apiCatalog = Object.freeze([
  {
    id: "platform-health",
    name: "Platform Health",
    version: "v1",
    status: "beta",
    description: "Status operacional do gateway e da plataforma.",
    basePath: "/v1/health",
    authentication: "public",
  },
]);

export function listPublicApis() {
  return apiCatalog.map((api) => ({ ...api }));
}
