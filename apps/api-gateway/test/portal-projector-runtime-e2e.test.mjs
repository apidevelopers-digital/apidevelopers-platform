import test from "node:test";
import assert from "node:assert/strict";

import { createPortalDerivedStore } from "../../../packages/portal-projector/src/derived-store.mjs";
import { createPortalInstitutionalReadApi } from "../../../packages/portal-projector/src/read-api.mjs";
import { createClientRegistry } from "../src/client-registry.mjs";
import { createPortalProjectorGatewayRoute } from "../src/portal-projector-route.mjs";

const COMMIT = "b".repeat(40);
const CHECKSUM = "c".repeat(64);

test("serves institutional projection from API key through the gateway", async () => {
  const projection = Object.freeze({
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit: COMMIT,
    contentChecksum: CHECKSUM,
    documentCount: 1,
    recordCount: 1,
    counts: Object.freeze({ Node: 1 }),
    integrity: Object.freeze({ status: "in_sync" }),
    records: Object.freeze([
      Object.freeze({
        institutionalType: "Node",
        institutionalId: "NODE-1",
        name: "Portal Projector",
      }),
    ]),
  });

  const store = createPortalDerivedStore();
  store.publisher.publish(projection);
  const readApi = createPortalInstitutionalReadApi({ reader: store.reader });

  const registry = createClientRegistry({
    keyFactory: () => "apid_test_portal_projector_key_00000001",
    clientId: () => "client-portal-test",
    keyId: () => "key-portal-test",
    clock: () => "2026-07-21T00:00:00.000Z",
  });
  const issued = registry.createClient({
    name: "Portal read client",
    contactEmail: "portal@example.invalid",
    scopes: ["portal:summary:read"],
  });

  const route = createPortalProjectorGatewayRoute({
    readApi,
    apiKeyManager: registry,
    rateLimiter: { check: () => ({ allowed: true }) },
  });

  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/portal/summary",
    headers: { "x-api-key": issued.apiKey },
    remoteAddress: "127.0.0.1",
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.data.sourceCommit, COMMIT);
  assert.equal(body.data.contentChecksum, CHECKSUM);
  assert.equal(route.mutationAllowed, false);
  assert.equal("publish" in route, false);
});
