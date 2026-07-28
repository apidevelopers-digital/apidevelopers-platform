import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createToolInvocationPolicy } from "@apidevelopers/contracts";

import { createToolGuardedOperationalGateway } from "../src/operational-tool-invocation-composition.mjs";

function request(apiKey, method, url, body) {
  return {
    method,
    url,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "x-correlation-id": "corr_http",
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
  };
}

function principal(tenantId, id, kind, scopes) {
  return {
    id,
    tenantId,
    kind,
    scopes,
  };
}

test("exposes evaluation only, never executes, and keeps decisions tenant isolated", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "tool-invocation-http-"),
  );
  const stateFilePath = join(directory, "state.json");

  try {
    const policies = [
      createToolInvocationPolicy({
        policyId: "policy_catalog",
        tenantId: "tenant_001",
        toolId: "catalog.read",
        allowedActions: ["read"],
        deniedActions: ["delete"],
        maxCallsPerRequest: 2,
        humanApprovalRequired: false,
      }),
      createToolInvocationPolicy({
        policyId: "policy_message",
        tenantId: "tenant_001",
        toolId: "message.send",
        allowedActions: ["send"],
        deniedActions: [],
        maxCallsPerRequest: 1,
        humanApprovalRequired: true,
      }),
    ];

    const tenantGateway = createToolGuardedOperationalGateway({
      stateFilePath,
      adminKey: "tenant-secret",
      adminPrincipal: principal(
        "tenant_001",
        "service_001",
        "service",
        ["tool:invoke", "audit:read"],
      ),
      toolInvocationPolicies: policies,
    });

    const allowedResponse =
      await tenantGateway.app.handleRequest(
        request(
          "tenant-secret",
          "POST",
          "/v1/global-trust/tool-invocations/evaluate",
          {
            tenantId: "tenant_other",
            toolId: "catalog.read",
            action: "read",
            useCase: "catalog.lookup",
            callCount: 1,
            executionClass: "read",
            correlationId: "corr_allow",
            arguments: {
              productId: "product_001",
            },
          },
        ),
      );
    assert.equal(allowedResponse.status, 200);
    const allowed = JSON.parse(allowedResponse.body);
    assert.equal(allowed.tenantId, "tenant_001");
    assert.equal(allowed.decision.tenantId, "tenant_001");
    assert.equal(allowed.decision.outcome, "allow");
    assert.equal(allowed.executed, false);
    assert.equal(allowed.executorAvailable, false);
    assert.equal(JSON.stringify(allowed).includes("product_001"), false);
    assert.equal(JSON.stringify(allowed).includes("tenant_other"), false);

    const pendingResponse =
      await tenantGateway.app.handleRequest(
        request(
          "tenant-secret",
          "POST",
          "/v1/global-trust/tool-invocations/evaluate",
          {
            toolId: "message.send",
            action: "send",
            useCase: "customer.notification",
            callCount: 1,
            executionClass: "write",
            correlationId: "corr_pending",
            arguments: {
              recipientId: "contact_001",
              templateId: "template_001",
            },
          },
        ),
      );
    assert.equal(pendingResponse.status, 202);
    const pending = JSON.parse(pendingResponse.body);
    assert.equal(pending.decision.outcome, "pending_approval");
    assert.equal(pending.executed, false);

    const administrativeResponse =
      await tenantGateway.app.handleRequest(
        request(
          "tenant-secret",
          "POST",
          "/v1/global-trust/tool-invocations/evaluate",
          {
            toolId: "catalog.read",
            action: "deploy",
            useCase: "unsafe.admin",
            callCount: 1,
            executionClass: "administrative",
            correlationId: "corr_admin",
            arguments: {},
          },
        ),
      );
    assert.equal(administrativeResponse.status, 403);
    const administrative = JSON.parse(
      administrativeResponse.body,
    );
    assert.equal(administrative.decision.outcome, "deny");
    assert.equal(
      administrative.decision.reasonCodes.includes(
        "administrative_execution_blocked",
      ),
      true,
    );
    assert.equal(administrative.executed, false);

    const executeResponse =
      await tenantGateway.app.handleRequest(
        request(
          "tenant-secret",
          "POST",
          "/v1/global-trust/tool-invocations/execute",
          {},
        ),
      );
    assert.equal(executeResponse.status, 404);

    const listResponse =
      await tenantGateway.app.handleRequest(
        request(
          "tenant-secret",
          "GET",
          "/v1/global-trust/tool-invocations/decisions",
        ),
      );
    assert.equal(listResponse.status, 200);
    const list = JSON.parse(listResponse.body);
    assert.equal(list.tenantId, "tenant_001");
    assert.equal(list.count, 3);
    assert.equal(list.sensitiveContentIncluded, false);
    assert.equal(JSON.stringify(list).includes("contact_001"), false);

    const otherTenantGateway = createToolGuardedOperationalGateway({
      stateFilePath,
      adminKey: "other-secret",
      adminPrincipal: principal(
        "tenant_other",
        "service_other",
        "service",
        ["tool:invoke", "audit:read"],
      ),
      toolInvocationPolicies: policies,
    });

    const otherListResponse =
      await otherTenantGateway.app.handleRequest(
        request(
          "other-secret",
          "GET",
          "/v1/global-trust/tool-invocations/decisions",
        ),
      );
    assert.equal(otherListResponse.status, 200);
    const otherList = JSON.parse(otherListResponse.body);
    assert.equal(otherList.count, 0);
    assert.deepEqual(otherList.decisions, []);
    assert.equal(
      JSON.stringify(otherList).includes("tenant_001"),
      false,
    );

    const noPolicyResponse =
      await otherTenantGateway.app.handleRequest(
        request(
          "other-secret",
          "POST",
          "/v1/global-trust/tool-invocations/evaluate",
          {
            toolId: "catalog.read",
            action: "read",
            useCase: "catalog.lookup",
            callCount: 1,
            executionClass: "read",
            correlationId: "corr_other",
            arguments: {},
          },
        ),
      );
    assert.equal(noPolicyResponse.status, 403);
    const noPolicy = JSON.parse(noPolicyResponse.body);
    assert.deepEqual(
      noPolicy.decision.reasonCodes,
      ["policy_not_found"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires tool:invoke scope before evaluating a proposal", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "tool-invocation-scope-"),
  );

  try {
    const gateway = createToolGuardedOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "read-only-secret",
      adminPrincipal: principal(
        "tenant_001",
        "reader_001",
        "human",
        ["audit:read"],
      ),
      toolInvocationPolicies: [
        createToolInvocationPolicy({
          policyId: "policy_catalog",
          tenantId: "tenant_001",
          toolId: "catalog.read",
          allowedActions: ["read"],
          deniedActions: [],
          maxCallsPerRequest: 1,
          humanApprovalRequired: false,
        }),
      ],
    });

    const response = await gateway.app.handleRequest(
      request(
        "read-only-secret",
        "POST",
        "/v1/global-trust/tool-invocations/evaluate",
        {
          toolId: "catalog.read",
          action: "read",
          useCase: "catalog.lookup",
          callCount: 1,
          executionClass: "read",
          correlationId: "corr_scope",
          arguments: {},
        },
      ),
    );

    assert.equal(response.status, 403);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "forbidden");
    assert.deepEqual(
      body.authorizationDecision.reasonCodes,
      ["missing_scope:tool:invoke"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
