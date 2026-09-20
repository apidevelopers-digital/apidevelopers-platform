import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../preview/trust-face-access/index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../preview/trust-face-access/trust-face-access-preview.js", import.meta.url), "utf8");

test("Trust Face Access preview page exposes Face ID actions", () => {
  assert.match(html, /Entrar com Face ID/u);
  assert.match(html, /Cadastrar Face ID/u);
  assert.match(html, /trust-face-access-preview\.js/u);
  assert.match(html, /não usar como login obrigatório global/u);
});

test("Trust Face Access preview script targets preview API contract", () => {
  for (const route of [
    "/v1/trust/face-access/status",
    "/v1/trust/face-access/register/options",
    "/v1/trust/face-access/register/verify",
    "/v1/trust/face-access/authenticate/options",
    "/v1/trust/face-access/authenticate/verify",
  ]) assert.match(js, new RegExp(route.replaceAll("/", "\\/"), "u"));
  assert.match(js, /navigator\.credentials\.create/u);
  assert.match(js, /navigator\.credentials\.get/u);
});

test("Trust Face Access preview avoids server-side biometric storage language", () => {
  assert.doesNotMatch(html, /rekognition/i);
  assert.doesNotMatch(html, /faceImage/i);
  assert.doesNotMatch(js, /faceImage/i);
});
