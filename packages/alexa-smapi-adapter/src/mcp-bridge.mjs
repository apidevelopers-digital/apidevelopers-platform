// R1 adapter for the institutional MCP; registration happens in the MCP backend.
const schemas = Object.freeze([
  Object.freeze({
    name: "alexa.skills.list",
    risk: "R1",
    mode: "read",
    description: "List Alexa skills for an authorized vendor. No mutations.",
    input_schema: {
      type: "object",
      properties: {
        vendorId: { type: "string" },
        maxResults: { type: "integer", minimum: 1, maximum: 50 },
        nextToken: { type: "string" },
      },
      required: ["vendorId"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "alexa.skills.manifest",
    risk: "R1",
    mode: "read",
    description: "Read an Alexa skill manifest at a specified stage.",
    input_schema: {
      type: "object",
      properties: {
        skillId: { type: "string" },
        stage: { type: "string", enum: ["development", "live"] },
      },
      required: ["skillId"],
      additionalProperties: false,
    },
  }),
]);

export function createAlexaMcpBridge(reader) {
  if (!reader || typeof reader.listSkills !== "function" || typeof reader.getManifest !== "function") {
    throw new TypeError("SMAPI reader required");
  }
  return Object.freeze({
    tools: schemas,
    async call(name, input = {}) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("invalid_tool_input");
      }
      const keys = Object.keys(input);
      if (name === "alexa.skills.list") {
        if (keys.some((k) => !["vendorId", "maxResults", "nextToken"].includes(k))) {
          throw new TypeError("invalid_tool_input");
        }
        return reader.listSkills(input);
      }
      if (name === "alexa.skills.manifest") {
        if (keys.some((k) => !["skillId", "stage"].includes(k))) {
          throw new TypeError("invalid_tool_input");
        }
        return reader.getManifest(input);
      }
      throw new Error("alexa_tool_not_supported");
    },
  });
}
