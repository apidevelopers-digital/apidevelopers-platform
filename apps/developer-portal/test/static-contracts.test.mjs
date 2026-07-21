import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [indexHtml, institutionalHtml] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/institutional.html", import.meta.url), "utf8"),
]);

assert.match(indexHtml, /API Developers\.digital/);
assert.match(institutionalHtml, /Portal Institucional/);
assert.match(institutionalHtml, /Somente leitura/);
assert.match(institutionalHtml, /Não aprovada/);
assert.match(institutionalHtml, /\/v1\/portal\/snapshot/);
assert.match(institutionalHtml, /\/v1\/admin\/learning/);
assert.match(institutionalHtml, /method:\s*"GET"/);
assert.doesNotMatch(institutionalHtml, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
assert.doesNotMatch(institutionalHtml, /localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(institutionalHtml, /data-action=["'](?:approve|execute|mutate)/i);

console.log("developer-portal static contracts: ok");
