#!/usr/bin/env node
import { generateReactViteProject } from "./project-generator.mjs";

function parseArgs(argv) {
  const args = { apply: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--apply") {
      args.apply = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`unexpected_argument:${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`missing_value:${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return {
    app: args.app,
    domain: args.domain,
    title: args.title,
    outputRoot: args.output,
    apply: args.apply,
  };
}

try {
  const result = await generateReactViteProject(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
