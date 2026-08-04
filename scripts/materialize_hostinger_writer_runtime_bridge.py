from pathlib import Path

path = Path("apps/api-gateway/src/operational-runtime.mjs")
source = path.read_text()

import_anchor = 'import { resolve } from "node:path";\n'
import_insert = import_anchor + 'import { createHostingerWriterRuntime } from "./hostinger-writer-runtime.mjs";\n'
if source.count(import_anchor) != 1:
    raise SystemExit("import_anchor_count")
source = source.replace(import_anchor, import_insert, 1)

sig_anchor = '  githubTransport,\n} = {}) {'
sig_insert = '  githubTransport,\n  hostingerWriterFactory = createHostingerWriterRuntime,\n} = {}) {'
if source.count(sig_anchor) != 1:
    raise SystemExit("signature_anchor_count")
source = source.replace(sig_anchor, sig_insert, 1)

runtime_anchor = """  const githubRuntime = githubRuntimeFactory({
    env,
    secretProvider: resolvedGitHubSecretProvider,
    transport: resolvedGitHubTransport,
  });

  const gateway = gatewayFactory({"""
runtime_insert = """  const githubRuntime = githubRuntimeFactory({
    env,
    secretProvider: resolvedGitHubSecretProvider,
    transport: resolvedGitHubTransport,
  });

  const hostingerWriter = hostingerWriterFactory({
    roots: [],
    enabled: false,
    approvalVerifier: async () => false,
  });

  const gateway = gatewayFactory({"""
if source.count(runtime_anchor) != 1:
    raise SystemExit("runtime_anchor_count")
source = source.replace(runtime_anchor, runtime_insert, 1)

descriptor_anchor = """      adminKeyConfigured: Boolean(config.adminKey),
      githubReadonly: githubRuntime.descriptor,
    }),"""
descriptor_insert = """      adminKeyConfigured: Boolean(config.adminKey),
      githubReadonly: githubRuntime.descriptor,
      hostingerWriter: Object.freeze({
        mode: hostingerWriter.mode,
        capabilities: hostingerWriter.capabilities,
      }),
    }),"""
if source.count(descriptor_anchor) != 1:
    raise SystemExit("descriptor_anchor_count")
source = source.replace(descriptor_anchor,descriptor_insert,1)

path.write_text(source)
