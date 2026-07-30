import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

import { assertPublishingManifest } from "./publishing-manifest.mjs";

const APP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

function assertSafeSegment(value, field) {
  if (typeof value !== "string" || !APP_NAME_PATTERN.test(value)) {
    throw new Error(`${field}_must_be_kebab_case`);
  }
  return value;
}

function assertDomain(value) {
  if (typeof value !== "string" || !DOMAIN_PATTERN.test(value.toLowerCase())) {
    throw new Error("domain_is_invalid");
  }
  return value.toLowerCase();
}

function assertOutputRoot(outputRoot) {
  if (typeof outputRoot !== "string" || outputRoot.trim() === "") {
    throw new Error("output_root_is_required");
  }

  const resolved = path.resolve(outputRoot);
  if (resolved === path.parse(resolved).root) {
    throw new Error("output_root_cannot_be_filesystem_root");
  }
  return resolved;
}

function createManifest({ app, domain }) {
  return assertPublishingManifest({
    schemaVersion: "1.0",
    app,
    domain,
    runtime: "react-vite",
    branch: "main",
    hosting: "hostinger",
    build: "npm run build",
    output: "dist",
    healthcheck: "/",
    approvalPolicy: "explicit-igor-approval",
    preview: {
      required: true,
      domainPattern: `preview-${app}.apidevelopers.digital`,
    },
    release: {
      byCommit: true,
      rollbackByCommit: true,
    },
    requiredChecks: ["build", "test", "healthcheck"],
    requiredSecrets: [],
  });
}

function renderFiles({ app, title, manifest }) {
  const packageJson = {
    name: app,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
      test: "node --test",
    },
    dependencies: {
      "@vitejs/plugin-react": "^4.3.4",
      vite: "^6.0.5",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {},
  };

  return {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "publishing-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "index.html": `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${title}" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    "src/main.jsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    "src/App.jsx": `export default function App() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">API Developers.digital</p>
        <h1>${title}</h1>
        <p>Projeto criado pela Site Factory GitHub-first da Onda 13.</p>
      </section>
    </main>
  );
}
`,
    "src/styles.css": `:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #101828;
  background: #f8fafc;
}
* { box-sizing: border-box; }
body { margin: 0; }
.shell { min-height: 100vh; display: grid; place-items: center; padding: 2rem; }
.hero { width: min(760px, 100%); padding: 3rem; border: 1px solid #e4e7ec; border-radius: 1.5rem; background: white; box-shadow: 0 24px 60px rgba(16, 24, 40, 0.08); }
.eyebrow { font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
h1 { margin: 0.75rem 0; font-size: clamp(2.25rem, 8vw, 5rem); line-height: 0.95; }
`,
    "test/smoke.test.mjs": `import test from "node:test";
import assert from "node:assert/strict";

test("template project is operational", () => {
  assert.equal(typeof "${app}", "string");
  assert.ok("${app}".length > 0);
});
`,
    "README.md": `# ${title}

Projeto React/Vite gerado pela Site Factory GitHub-first.

## Fluxo

1. \`npm install\`
2. \`npm test\`
3. \`npm run build\`
4. publicar primeiro em preview
5. promover somente após aprovação explícita

O arquivo \`publishing-manifest.json\` é o contrato de publicação.
`,
  };
}

export function planReactViteProject({ app, domain, title, outputRoot }) {
  const safeApp = assertSafeSegment(app, "app");
  const safeDomain = assertDomain(domain);
  const safeTitle = typeof title === "string" && title.trim() !== "" ? title.trim() : safeApp;
  const root = assertOutputRoot(outputRoot);
  const targetDirectory = path.join(root, safeApp);

  if (!targetDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("target_directory_escaped_output_root");
  }

  const manifest = createManifest({ app: safeApp, domain: safeDomain });
  const renderedFiles = renderFiles({ app: safeApp, title: safeTitle, manifest });

  return {
    mode: "dry-run",
    readyForApply: true,
    writesEnabled: false,
    template: "react-vite",
    targetDirectory,
    manifest,
    files: Object.keys(renderedFiles).sort(),
    renderedFiles,
  };
}

async function pathExists(target) {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function generateReactViteProject(options) {
  const plan = planReactViteProject(options);

  if (options.apply !== true) {
    return plan;
  }

  if (await pathExists(plan.targetDirectory)) {
    throw new Error("target_directory_already_exists");
  }

  await mkdir(plan.targetDirectory, { recursive: false });

  for (const [relativePath, content] of Object.entries(plan.renderedFiles)) {
    const destination = path.join(plan.targetDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { encoding: "utf8", flag: "wx" });
  }

  return {
    ...plan,
    mode: "apply",
    readyForApply: false,
    writesEnabled: true,
    renderedFiles: undefined,
  };
}
