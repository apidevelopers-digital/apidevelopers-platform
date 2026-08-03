import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

export const DRY_RUN_APPROVAL = "IGOR_APROVA_OPERATOR_GATEWAY_DRY_RUN";
const ORGANIZATION = "apidevelopers-digital";
const SECRET_REF =
  "vault://github/operator-readonly-installation-token-dry-run";
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  HERE,
  "../fixtures/operator-gateway-controlled-dry-run.json",
);
const DEFAULT_OUTPUT = resolve(
  HERE,
  "../artifacts/operator-gateway-controlled-dry-run-evidence.json",
);

const zeroed = (bytes) =>
  bytes instanceof Uint8Array && [...bytes].every((value) => value === 0);

export async function runControlledDryRun({
  approval = process.env.OPERATOR_GATEWAY_DRY_RUN_APPROVAL,
  outputPath = DEFAULT_OUTPUT,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (approval !== DRY_RUN_APPROVAL) {
    throw new Error("controlled dry-run approval is missing or invalid");
  }

  const fixtureText = await readFile(FIXTURE, "utf8");
  const fixture = JSON.parse(fixtureText);
  const token = `ghs_${"A".repeat(516)}`;
  const vaultBytes = Buffer.from(token);
  const capture = {};
  const state = {
    vaultCalls: 0,
    consumerCalls: 0,
    transportCalls: 0,
    referenceAllowed: false,
    methodAllowed: false,
    pathAllowed: false,
    callerAuthHeader: false,
    transportBytes: undefined,
  };

  const vaultClient = Object.freeze({
    async withSecretLease(access, consumer) {
      state.vaultCalls += 1;
      state.referenceAllowed = access.secretRef === SECRET_REF;
      if (!state.referenceAllowed) throw new Error("synthetic reference denied");
      state.consumerCalls += 1;
      try {
        return await consumer({
          bytes: vaultBytes,
          version: "synthetic-dry-run-v1",
        });
      } finally {
        vaultBytes.fill(0);
      }
    },
  });

  const transport = Object.freeze({
    async requestWithCredential(input) {
      state.transportCalls += 1;
      state.transportBytes = input.credential.bytes;
      state.methodAllowed =
        input.request.method === fixture.operation.method;
      state.pathAllowed = input.request.path === fixture.operation.path;
      state.callerAuthHeader = Object.keys(input.request.headers ?? {}).some(
        (name) => name.toLowerCase() === "authorization",
      );
      if (!state.methodAllowed || !state.pathAllowed || state.callerAuthHeader) {
        throw new Error("synthetic transport policy denied request");
      }
      if (
        input.credential.bytes.byteLength !== 520 ||
        Buffer.from(input.credential.bytes).toString("utf8") !== token
      ) {
        throw new Error("synthetic credential mismatch");
      }
      return fixture.response;
    },
  });

  const runtime = createOperationalRuntime({
    cwd: resolve(HERE, ".."),
    env: {
      API_GATEWAY_STATE_FILE: "artifacts/dry-run-state.json",
      OPERATOR_GITHUB_ORGANIZATION: ORGANIZATION,
      OPERATOR_GITHUB_CREDENTIAL_REF: SECRET_REF,
    },
    gatewayFactory(options) {
      capture.options = options;
      return {
        app: { async handleRequest() {} },
        readiness: Object.freeze({}),
        store: Object.freeze({}),
      };
    },
    githubVaultClient: vaultClient,
    githubTransport: transport,
  });

  const response =
    await capture.options.githubReadonlyClient.getOrganization({
      organization: ORGANIZATION,
      correlationId: "corr_controlled_dry_run",
      tenantId: "uni.operador",
    });

  const descriptor = JSON.stringify(runtime.descriptor);
  const evidence = {
    schemaVersion: 1,
    mode: "controlled-dry-run",
    status: "success",
    generatedAt,
    approvalVerified: true,
    trigger: "workflow_dispatch",
    runner: {
      name: "igor-mac-runner",
      labels: ["self-hosted", "macOS", "X64"],
    },
    operation: {
      method: fixture.operation.method,
      path: fixture.operation.path,
      organization: ORGANIZATION,
    },
    result: {
      status: fixture.response.status,
      organization: response.login,
      fixtureSha256: createHash("sha256").update(fixtureText).digest("hex"),
    },
    controls: {
      vaultBackend: "synthetic-memory",
      referenceAllowlistMatched: state.referenceAllowed,
      vaultLeaseCalls: state.vaultCalls,
      leaseConsumerCalls: state.consumerCalls,
      localTransportCalls: state.transportCalls,
      externalRequestCount: 0,
      externalRequestExecuted: false,
      githubWriteExecuted: false,
      realCredentialLoaded: false,
      syntheticCredentialBytes: 520,
      methodAllowed: state.methodAllowed,
      pathAllowed: state.pathAllowed,
      callerAuthHeaderPresent: state.callerAuthHeader,
      rawVaultBytesZeroed: zeroed(vaultBytes),
      transportedBytesZeroed: zeroed(state.transportBytes),
      descriptorContainsSecretMaterial: descriptor.includes(token),
      descriptorContainsSecretReference: descriptor.includes(SECRET_REF),
      productionChanged: false,
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  return evidence;
}

async function main() {
  const arg = process.argv.find((value) => value.startsWith("--output="));
  const outputPath = arg
    ? resolve(process.cwd(), arg.slice("--output=".length))
    : DEFAULT_OUTPUT;
  process.stdout.write(
    `${JSON.stringify(await runControlledDryRun({ outputPath }), null, 2)}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        code: "controlled_dry_run_failed",
        message: error instanceof Error ? error.message : "unknown failure",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
