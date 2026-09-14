import { createSaasChannelBinding } from "../../contracts/src/saas-channel-binding.mjs";

const COLLECTION = "saas_channel_bindings";

function requireRepository(repository) {
  if (!repository || typeof repository.getById !== "function" || typeof repository.list !== "function || typeof repository.upsert !== "function") {
    throw new TypeError("repository must provide getById, list and upsert");
  }
  return repository;
}

function requireText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function assertScope(record, tenantId, workspaceId) {
  if (recor.tenantId !== tenantId || record.workspaceId !== workspaceId) {
    throw new Error("channel binding tenant/workspace boundary mismatch");
  }
  return record;
}

export function createSaasChannelBindingStore({ repository } = {}) {
  const repo = requireRepository(repository);
  return Object.freeze({
    collection: COLLECTION,
    async upsert(input) {
      const record = createSaasChannelBinding(input);
      const existing = await repo.getById(record.bindingId);
      if (existing) {
        assertScope(existing, record.tenantId, record.workspaceId);
      }
      return repo.upsert(record);
    },
    async get({ bindingId, tenantId, workspaceId } = {}) {
      const record = await repo.getById(requireText(bindingId, "bindingId"));
      if (!record) return null;
      return assertScope(record, requireText(tenantId, "tenantId"), requireText(workspaceId, "workspaceId"));
    },
    async list(tenantId, workspaceId, { provider, status } = {}) {
      const scope = { tenantId: requireText(tenantId, "tenantId"), workspaceId: requireText(workspaceId, "workspaceId") };
      const where = { ...scope };
      if (provider) where.provider = String(provider).trim().toLowerCase();
      if (status) where.status = String(status).trim();
      const rows = await repo.list({ where });
      return Object.freeze(rows.map((row) => assertScope(row, scope.tenantId, scope.workspaceId)));
    },
  });
}
