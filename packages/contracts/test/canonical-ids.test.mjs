import test from "node:test";
import assert from "node:assert/strict";

import {
  assertCanonicalId,
  canonicalIdContractVersion,
  canonicalIdFamilies,
  createCanonicalId,
  isCanonicalId,
  parseCanonicalId,
  validateCanonicalId,
} from "../src/canonical-ids.mjs";

test("exports a frozen versioned family registry", () => {
  assert.equal(canonicalIdContractVersion, "1.0.0");
  assert.equal(Object.isFrozen(canonicalIdFamilies), true);
  assert.equal(Object.isFrozen(canonicalIdFamilies.contract), true);
  assert.equal(canonicalIdFamilies.component.minSegments, 2);
  assert.equal(canonicalIdFamilies.contract.versioned, true);
});

test("accepts canonical examples from the architecture freeze", () => {
  const ids = [
    "capability.publish",
    "component.github.publisher",
    "contract.publish.v1",
    "policy.security.release",
    "decision.20260716.0001",
  ];

  for (const id of ids) {
    assert.equal(isCanonicalId(id), true, id);
  }
});

test("parses lifecycle identifiers without treating their segments as aliases", () => {
  const result = parseCanonicalId("decision.20260716.0001");
  assert.equal(result.family, "decision");
  assert.deepEqual(result.segments, ["20260716", "0001"]);
  assert.deepEqual(result.semanticSegments, ["20260716", "0001"]);
  assert.equal(result.versionMajor, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.segments), true);
});

test("parses contract identifiers and extracts the major version", () => {
  const result = parseCanonicalId("contract.publish.v12", {
    expectedFamily: "contract",
  });
  assert.equal(result.family, "contract");
  assert.deepEqual(result.semanticSegments, ["publish"]);
  assert.equal(result.versionMajor, 12);
});

test("rejects missing identifiers", () => {
  assert.equal(validateCanonicalId("").code, "ID_REQUIRED");
  assert.equal(validateCanonicalId(null).code, "ID_REQUIRED");
});

test("rejects surrounding whitespace rather than normalizing silently", () => {
  const result = validateCanonicalId(" capability.publish");
  assert.equal(result.valid, false);
  assert.equal(result.code, "ID_WHITESPACE");
});

test("rejects uppercase identifiers rather than lowercasing silently", () => {
  const result = validateCanonicalId("Capability.publish");
  assert.equal(result.valid, false);
  assert.equal(result.code, "ID_CASE");
});

test("rejects empty dotted segments", () => {
  assert.equal(validateCanonicalId("component..publisher").code, "ID_EMPTY_SEGMENT");
  assert.equal(validateCanonicalId("decision.20260716.").code, "ID_EMPTY_SEGMENT");
});

test("rejects unknown families", () => {
  const result = validateCanonicalId("service.github.publisher");
  assert.equal(result.valid, false);
  assert.equal(result.code, "ID_UNKNOWN_FAMILY");
  assert.equal(result.family, "service");
});

test("rejects underscores, spaces and other non-canonical segment characters", () => {
  assert.equal(validateCanonicalId("capability.publish_now").code, "ID_INVALID_SEGMENT");
  assert.equal(validateCanonicalId("capability.publish now").code, "ID_INVALID_SEGMENT");
  assert.equal(validateCanonicalId("capability.publish@now").code, "ID_INVALID_SEGMENT");
});

test("enforces family-specific segment counts", () => {
  assert.equal(validateCanonicalId("component.publisher").code, "ID_SEGMENT_COUNT");
  assert.equal(validateCanonicalId("policy.release").code, "ID_SEGMENT_COUNT");
  assert.equal(validateCanonicalId("decision").code, "ID_SEGMENT_COUNT");
});

test("enforces positive major versions for contract identifiers", () => {
  assert.equal(validateCanonicalId("contract.publish").code, "ID_INVALID_VERSION");
  assert.equal(validateCanonicalId("contract.publish.v0").code, "ID_INVALID_VERSION");
  assert.equal(validateCanonicalId("contract.publish.v01").code, "ID_INVALID_VERSION");
  assert.equal(validateCanonicalId("contract.publish.1").code, "ID_INVALID_VERSION");
});

test("enforces the expected family when requested", () => {
  const result = validateCanonicalId("policy.security.release", {
    expectedFamily: "component",
  });
  assert.equal(result.code, "ID_FAMILY_MISMATCH");
  assert.equal(result.expectedFamily, "component");
});

test("assertCanonicalId throws typed errors with stable codes", () => {
  assert.throws(
    () => assertCanonicalId("contract.publish.latest"),
    (error) => {
      assert.equal(error instanceof TypeError, true);
      assert.equal(error.code, "ID_INVALID_VERSION");
      assert.equal(error.details.valid, false);
      return true;
    },
  );
});

test("creates canonical non-versioned identifiers from explicit segments", () => {
  assert.equal(
    createCanonicalId({
      family: "component",
      segments: ["github", "publisher"],
    }),
    "component.github.publisher",
  );
});

test("creates versioned contract identifiers only with explicit major versions", () => {
  assert.equal(
    createCanonicalId({
      family: "contract",
      segments: ["publish"],
      versionMajor: 2,
    }),
    "contract.publish.v2",
  );

  assert.throws(
    () => createCanonicalId({ family: "contract", segments: ["publish"] }),
    /versionMajor must be a positive safe integer/,
  );
});

test("does not allow contract versions on other id families", () => {
  assert.throws(
    () =>
      createCanonicalId({
        family: "capability",
        segments: ["publish"],
        versionMajor: 1,
      }),
    /versionMajor is only valid for contract ids/,
  );
});

test("does not normalize invalid segments during creation", () => {
  assert.throws(
    () =>
      createCanonicalId({
        family: "capability",
        segments: ["Publish_Now"],
      }),
    /invalid canonical id segment/,
  );
});
