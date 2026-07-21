import test from "node:test";
import assert from "node:assert/strict";

import {
  PortalInstitutionalPublisherError,
  createPortalInstitutionalPublisher,
} from "../src/institutional-publisher.mjs";
import { createPortalDerivedStore } from "../src/derived-store.mjs";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);

function projection(sourceCommit = COMMIT_A, checksum = "c".repeat(64)) {
  return {
    schemaVersion: "portal.institutional-state/v1",
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit,
    contentChecksum: checksum,
    recordCount: 1,
    records: [{ institutionalType: "Node", institutionalId: "NODE-1" }],
    integrity: {
      status: "in_sync",
      checkedRecordCount: 1,
      findingCount: 0,
    },
  };
}

test("projects and publishes through the explicit internal port", async () => {
  const store = createPortalDerivedStore();
  const calls = [];
  const reader = { commit: COMMIT_A, mutationAllowed: false };

  const service = createPortalInstitutionalPublisher({
    publisher: store.publisher,
    projector: async ({ reader: observedReader, marker }) => {
      calls.push(["project", observedReader, marker]);
      return projection();
    },
    projectionOptions: { marker: "base" },
  });

  const receipt = await service.projectAndPublish({
    reader,
    expectedCurrentCommit: null,
  });

  assert.deepEqual(calls, [["project", reader, "base"]]);
  assert.deepEqual(receipt, {
    sourceCommit: COMMIT_A,
    contentChecksum: "c".repeat(64),
    published: true,
  });
  assert.equal(store.reader.readCurrent().sourceCommit, COMMIT_A);
  assert.equal(store.reader.mutationAllowed, false);
  assert.equal("publish" in store.reader, false);
});

test("call projection options override service defaults", async () => {
  const store = createPortalDerivedStore();
  let marker;

  const service = createPortalInstitutionalPublisher({
    publisher: store.publisher,
    projector: async (options) => {
      marker = options.marker;
      return projection();
    },
    projectionOptions: { marker: "base" },
  });

  await service.projectAndPublish({
    reader: { mutationAllowed: false },
    projectionOptions: { marker: "call" },
  });

  assert.equal(marker, "call");
});

test("is idempotent when the derived store already has the same projection", async () => {
  const store = createPortalDerivedStore();
  const service = createPortalInstitutionalPublisher({
    publisher: store.publisher,
    projector: async () => projection(),
  });

  const first = await service.projectAndPublish({ reader: {} });
  const second = await service.projectAndPublish({
    reader: {},
    expectedCurrentCommit: COMMIT_A,
  });

  assert.equal(first.published, true);
  assert.equal(second.published, false);
  assert.equal(store.reader.listVersions().length, 1);
});

test("forwards optimistic concurrency to the derived publisher", async () => {
  const store = createPortalDerivedStore();
  store.publisher.publish(projection());

  const service = createPortalInstitutionalPublisher({
    publisher: store.publisher,
    projector: async () => projection(COMMIT_B, "d".repeat(64)),
  });

  await assert.rejects(
    service.projectAndPublish({
      reader: {},
      expectedCurrentCommit: null,
    }),
    (error) => error.code === "PORTAL_DERIVED_STORE_CONFLICT",
  );
});

test("does not publish when projection fails", async () => {
  let publishes = 0;
  const service = createPortalInstitutionalPublisher({
    publisher: {
      mutationAllowed: true,
      publish() {
        publishes += 1;
      },
    },
    projector: async () => {
      throw new Error("projection failed");
    },
  });

  await assert.rejects(
    service.projectAndPublish({ reader: {} }),
    /projection failed/,
  );
  assert.equal(publishes, 0);
});

test("fails closed when the publication receipt commit diverges", async () => {
  const service = createPortalInstitutionalPublisher({
    publisher: {
      mutationAllowed: true,
      publish() {
        return {
          sourceCommit: COMMIT_B,
          contentChecksum: "c".repeat(64),
          published: true,
        };
      },
    },
    projector: async () => projection(),
  });

  await assert.rejects(
    service.projectAndPublish({ reader: {} }),
    (error) =>
      error instanceof PortalInstitutionalPublisherError &&
      error.code === "PORTAL_INSTITUTIONAL_PUBLISHER_COMMIT_MISMATCH",
  );
});

test("fails closed when the publication receipt checksum diverges", async () => {
  const service = createPortalInstitutionalPublisher({
    publisher: {
      mutationAllowed: true,
      publish() {
        return {
          sourceCommit: COMMIT_A,
          contentChecksum: "d".repeat(64),
          published: true,
        };
      },
    },
    projector: async () => projection(),
  });

  await assert.rejects(
    service.projectAndPublish({ reader: {} }),
    (error) =>
      error.code === "PORTAL_INSTITUTIONAL_PUBLISHER_CHECKSUM_MISMATCH",
  );
});

test("rejects publishers that are not explicit internal mutation ports", () => {
  assert.throws(
    () =>
      createPortalInstitutionalPublisher({
        publisher: { mutationAllowed: false, publish() {} },
      }),
    (error) => error.code === "PORTAL_INSTITUTIONAL_PUBLISHER_INVALID",
  );
});

test("exposes no read facade or canonical write capability", () => {
  const service = createPortalInstitutionalPublisher({
    publisher: { mutationAllowed: true, publish() {} },
    projector: async () => projection(),
  });

  assert.equal(service.mutationAllowed, true);
  assert.equal(typeof service.projectAndPublish, "function");
  assert.equal("reader" in service, false);
  assert.equal("writeCanonical" in service, false);
  assert.equal("commit" in service, false);
  assert.equal("merge" in service, false);
});
