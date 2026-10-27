// Deliberately minimal OpenAPI fixture mirroring the documented StartBuildRequest shape.
export const HOSTINGER_NODE_BUILD_PATH = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
export const HOSTINGER_NODE_BUILD_SCHEMA_REF = "#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest";
export function startBuildSchemaFixture() {
  return {
    type: "object",
    required: ["node_version", "app_type", "root_directory", "output_directory",
      "build_script", "source_type", "source_options"],
    properties: {
      node_version: { type: "integer", enum: [18, 20, 22, 24] },
      app_type: { type: "string", nullable: true, enum: "create-react-app gatsby vite angular react vue parcel next nuxt nest express fastify astro svelte svelte-kit hono react-router nitro other".split(" ") },
      root_directory: { type: "string", nullable: true, minLength: 1, maxLength: 200 },
      output_directory: { type: "string", nullable: true, minLength: 1, maxLength: 200 },
      build_script: { type: "string", nullable: true, minLength: 1, maxLength: 64 },
      entry_file: { type: "string", nullable: true, minLength: 1, maxLength: 200 },
      package_manager: { type: "string", nullable: true, minLength: 1, maxLength: 20, enum: ["npm", "yarn", "pnpm"] },
      source_type: { type: "string", enum: ["archive", "git"] },
      source_options: { type: "object", nullable: true, properties: { archive_path: { type: "string" } } }
    }
  };
}
export function currentOpenApiFixture() {
  return {
    openapi: "3.0.0",
    info: { version: "2.3.0" },
    paths: {
      [HOSTINGER_NODE_BUILD_PATH]: {
        post: { requestBody: { content: {
          "application/json": { schema: { $ref: HOSTINGER_NODE_BUILD_SCHEMA_REF } }
        } } }
      }
    },
    components: { schemas: { "Hosting.V1.NodeJs.StartBuildRequest": startBuildSchemaFixture() } }
  };
}
