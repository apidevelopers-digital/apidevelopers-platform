import { createRegistry } from "@apidevelopers/registry-core";

export const apiRegistry = createRegistry({
  entries: [
    {
      id: "platform-health",
      name: "Platform Health",
      version: "v1",
      status: "beta",
      visibility: "public",
      tags: ["platform", "public"],
      description: "Status operacional do gateway e da plataforma.",
      basePath: "/v1/health",
      authentication: "public",
    },
  ],
});

export function listPublicApis() {
  return apiRegistry.list({ visibility: "public" });
}

export function getPublicApi(id) {
  const api = apiRegistry.get(id);
  return api?.visibility === "public" ? api : null;
}
