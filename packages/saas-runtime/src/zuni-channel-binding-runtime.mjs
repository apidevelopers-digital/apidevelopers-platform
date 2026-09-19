import { createChannelBindingId, createSaasChannelBinding } from "../../contracts/src/saas-channel-binding.mjs";
import { createDurableRepository } from "../../persistence-core/src/index.mjs";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function stableComparable(binding) {
  return JSON.stringify({
    bindingId: binding.bindingId,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    productId: binding.productId,
    provider: binding.provider,
    channelType: binding.channelType,
    channelId: binding.channelId,
    wabaId: binding.wabaId,
    phoneNumberId: binding.phoneNumberId,
    credentialRef: binding.credentialRef,
    status: binding.status,
  });
}

export function createZuniChannelBindingRuntime({ store, saasRuntime } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }
  if (!saasRuntime || typeof saasRuntime.getTenant !== "function" || typeof saasRuntime.getWorkspace !== "function") {
    throw new TypeError("saasRuntime must provide getTenant and getWorkspace");
  }

  const channelBindings = createDurableRepository({
    store,
    collection: "saas.channelBindings",
    idField: "bindingId",
  });

  async function assertScope({ tenantId, workspaceId } = {}) {
    const normalizedTenantId = requireText(tenantId, "tenantId");
    const normalizedWorkspaceId = requireText(workspaceId, "workspaceId");

    const tenant = await saasRuntime.getTenant(normalizedTenantId);
    if (!tenant) throw new Error("channel binding tenant not found");
    if (tenant.status !== "active") throw new Error("channel binding tenant is not active");

    const workspace = await saasRuntime.getWorkspace(normalizedWorkspaceId);
    if (!workspace) throw new Error("channel binding workspace not found");
    if (workspace.status !== "active") throw new Error("channel binding workspace is not active");
    if (workspace.tenantId !== tenant.tenantId) {
      throw new Error("channel binding workspace tenant boundary mismatch");
    }
    if (workspace.productId !== "zuni") {
      throw new Error("channel binding workspace product boundary mismatch");
    }

    return Object.freeze({ tenant, workspace });
  }

  async function registerChannelBinding(input = {}) {
    const tenantId = requireText(input.tenantId, "tenantId");
    const workspaceId = requireText(input.workspaceId, "workspaceId");
    const channelId = requireText(input.channelId, "channelId");
    const scope = await assertScope({ tenantId, workspaceId });

    const generatedBindingId = createChannelBindingId(
      scope.tenant.slug,
      scope.workspace.slug,
      channelId,
    );
    const requestedBindingId = String(input.bindingId ?? "").trim();
    if (requestedBindingId && requestedBindingId !== generatedBindingId) {
      throw new Error("channel binding id boundary mismatch");
    }

    const binding = createSaasChannelBinding({
      ...input,
      bindingId: generatedBindingId,
      tenantId: scope.tenant.tenantId,
      workspaceId: scope.workspace.workspaceId,
      productId: "zuni",
    });

    if (scope.workspace.tenantId !== binding.tenantId) {
      throw new Error("channel binding workspace tenant boundary mismatch");
    }
    if (scope.workspace.productId !== binding.productId) {
      throw new Error("channel binding workspace product boundary mismatch");
    }

    const existing = await channelBindings.getById(binding.bindingId);
    if (existing) {
      if (stableComparable(existing) === stableComparable(binding)) return existing;
      throw new Error("channel binding already exists with different payload");
    }

    return channelBindings.create(binding);
  }

  async function getChannelBinding({ bindingId, tenantId, workspaceId } = {}) {
    const normalizedBindingId = requireText(bindingId, "bindingId");
    const scope = await assertScope({ tenantId, workspaceId });
    const binding = await channelBindings.getById(normalizedBindingId);
    if (!binding) return null;
    if (binding.tenantId !== scope.tenant.tenantId || binding.workspaceId !== scope.workspace.workspaceId) {
      return null;
    }
    return binding;
  }

  async function listChannelBindings({ tenantId, workspaceId, status } = {}) {
    const scope = await assertScope({ tenantId, workspaceId });
    const where = {
      tenantId: scope.tenant.tenantId,
      workspaceId: scope.workspace.workspaceId,
    };
    if (status != null) where.status = requireText(status, "status");
    return channelBindings.list({ where });
  }

  return Object.freeze({
    registerChannelBinding,
    getChannelBinding,
    listChannelBindings,
  });
}
