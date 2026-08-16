import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createWebAgentShadowMemoryProvider,
  deriveWebAgentContactKey,
  WEB_AGENT_SHADOW_MEMORY_COLLECTION,
} from "../src/web-agent-shadow-memory-provider.mjs";

test("private Web Agent memory stays isolated", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-memory-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createJsonFileStore({ filePath: join(dir, "state.json"), fsync: false });
  const memory = createWebAgentShadowMemoryProvider({ store });

  const common = { tenantId: "tenant:web", customerRef: "Client@example.com" };
  const uni = { ...common, agentId: "uni.co", workspaceId: "workspace:uni" };
  const nexus = { ...common, agentId: "nexus", workspaceId: "workspace:nexus" };

  const a = await memory.upsert({ ...uni, data: { marker: "uni" } });
  const b = await memory.upsert({ ...nexus, data: { marker: "nexus" } });

  assert.equal(a.contactKey, b.contactKey);
  assert.notEqual(a.memoryRecordId, b.memoryRecordId);
  assert.deepEqual((await memory.recall(uni)).data, { marker: "uni" });
  assert.deepEqual((await memory.recall(nexus)).data, { marker: "nexus" });
  assert.equal(await memory.recall({ ...uni, workspaceId: nexus.workspaceId }), null);
  assert.equal(await memory.recall({ ...nexus, workspaceId: uni.workspaceId }), null);

  const state = await store.read();
  assert.equal(Object.keys(state.collections?.[WEB_AGENT_SHADOW_MEMORY_COLLECTION] ?? {}).length, 2);
  assert.equal(deriveWebAgentContactKey("Client@example.com"), deriveWebAgentContactKey("client@example.com"));
  await assert.rejects(() => memory.recall({ ...uni, agentId: "unsupported" }), /unsupported agentId/);
});
