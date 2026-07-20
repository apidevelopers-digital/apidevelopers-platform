import { createMemoryBillingRepository } from "./repository.mjs";
import { createBillingContext } from "./service-context.mjs";
import { createInvoiceOperations } from "./invoice-operations.mjs";
import { createPaymentOperations } from "./payment-operations.mjs";

export function createBillingService({
  repository = createMemoryBillingRepository(),
  idFactory,
  lineIdFactory,
  clock = () => new Date().toISOString(),
  overagePriceResolver,
  assertTenantOperational = () => true,
} = {}) {
  const ctx = createBillingContext({
    repository,
    idFactory,
    lineIdFactory,
    clock,
    overagePriceResolver,
    assertTenantOperational,
  });

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    ...createInvoiceOperations(ctx),
    ...createPaymentOperations(ctx),
    getCurrent: ctx.current,
    listHistory: (invoiceId) => repository.listHistory(invoiceId),
    listCurrentByTenant: (tenantId) => repository.listCurrentByTenant(tenantId),
  });
}
