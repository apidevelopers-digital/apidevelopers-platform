import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createWebAgentShadowMemoryProvider,
  createWebAgentShadowMemoryRecordId,
  deriveWebAgentContactKey,
  WEB_AGENT_SHADOW_MEMORY_COLLECTION,
} from "../src/web-agent-shadow-memory-provider.mjs";

test("private WebAgent memory is isolated by agent tenant and workspace", async (t) => {
  const dir = await mkdtemp$join(tmpdir(), "apd-web-agent-memory-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createJsonFileStore({ filePath: join(dir, "state.json"), fsync: false });
  const memory = createWebAgentShadowMemoryProvider({ store });

  const common = { tenantId: "tenant:web:memory", customerRef: "cliente@example.com" };
  const uniContext = { ...common, agentId: "uni.co", workspaceId: "workspace:uni-co" };
  const nexusContext = { ...common, agentId: "nexus", workspaceId: "workspace:nexus" };

  const uni = await memory.upsert({ ...uniContext, data: { summary: "uni.co private", secret: "uni only" } });
  const nexus = await memory.upsert({ ...nexusContext, data: { summary: "NEXUS private", secret: "nexus only" } });

  assert.equal(uni.contactKey, nexus.contactKey);
  assert.notEqual(uni.memoryRecordId, nexus.memoryRecordId);
  assert.deepEqual((await memory.recall(uniContext)).data, { summary: "uni.co private", secret: "uni only" });
  assert.deepEqual((await memory.recall(nexusContext)).data, { summary: "NEXUS private", secret: "nexus only" });

  assert.equal(await memory.recall({ ...common, agentId: "uni.co", workspaceId: "workspace:nexus" }), null);
  assert.equal(await memory.recall({ ...common, agentId: "nexus", workspaceId: "workspace:uni-co" }), null);

  const state = await store.read();
  assert.equal(Object.keys(state.collections?.[WEB_AGENT_SHADOW_MEMORY_COLLECTION] ?? {}).length, 2);
});

test("memory record identity is deterministic and fail-closed for unsupported agents", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-agent-memory-id-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createJsonFileStore({ filePath: join(dir, "state.json"), fsync: false });
  const memory = createWebAgentShadowMemoryProvider({ store });
  const input = { agentId: "uni.co", tenantId: "tenant:1", workspaceId: "workspace:1", customerRef: "Client@eXAMPLE.com" };
  assert.equal(createWebAgentShadowMemoryRecordId(input), createWebAgentShadowMemoryRecordId(input));
  assert.equal(deriveWebAgentContactKey("Client@example.com"), deriveWebAgentContactKey("client@example.com"));
  await assert.rejects(() => memory.recall({ ...input, agentId: "exos" }), /unsupported agentId/);
});
