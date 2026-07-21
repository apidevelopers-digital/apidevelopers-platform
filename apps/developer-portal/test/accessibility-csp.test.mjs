import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [html, css, behavior] = await Promise.all([
  read("../public/institutional.html"),
  read("../public/institutional.css"),
  read("../public/accessibility.js"),
]);

assert.match(html, /Content-Security-Policy/);
assert.match(html, /default-src 'self'/);
assert.match(html, /object-src 'none'/);
assert.match(html, /base-uri 'none'/);
assert.match(html, /form-action 'none'/);
assert.match(html, /name="referrer" content="no-referrer"/);
assert.doesNotMatch(html, /style="/);
assert.match(html, /class="skip-link"/);
assert.match(html, /role="tablist"/);
assert.equal((html.match(/role="tab"/g) || []).length, 5);
assert.equal((html.match(/role="tabpanel"/g) || []).length, 5);
assert.match(html, /role="status"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /aria-busy="false"/);
assert.match(html, /aria-describedby="apiKeyHelp"/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(behavior, /ArrowRight/);
assert.match(behavior, /ArrowLeft/);
assert.match(behavior, /Home/);
assert.match(behavior, /End/);
assert.match(behavior, /aria-selected/);
assert.match(behavior, /aria-busy/);

console.log("developer-portal accessibility and CSP contracts: ok");
