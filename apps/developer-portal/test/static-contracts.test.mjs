
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [indexHtml, html, css, client, portal] = await Promise.all([
  read("../public/index.html"),
  read("../public/institutional.html"),
  read("../public/institutional.css"),
  read("../public/api-client.js"),
  read("../public/portal.js"),
]);
const bundle = [html, css, client, portal].join("\n");

assert.match(indexHtml, /API Developers\.digital/);
assert.match(html, /Portal Institucional/);
assert.match(html, /Somente leitura/);
assert.match(html, /institutional\.css/);
assert.match(html, /portal\.js/);
assert.match(client, /\/v1\/portal\/snapshot/);
assert.match(client, /\/v1\/admin\/learning/);
assert.match(client, /method:\s*"GET"/);
assert.match(client, /credentials:\s*"omit"/);
assert.match(client, /cache:\s*"no-store"/);
assert.doesNotMatch(bundle, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
assert.doesNotMatch(bundle, /localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(portal, /innerHTML/);
assert.match(portal, /Não aprovada/);
assert.match(portal, /Sem permissão ou bloqueado por política/);
assert.match(portal, /Potencialmente desatualizado/);

console.log("developer-portal modular read-only contracts: ok");
