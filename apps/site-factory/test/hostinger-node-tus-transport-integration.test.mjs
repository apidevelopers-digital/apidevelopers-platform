import test from "node:test";
import assert from "node:assert/strict";
import { createTusMockTransport, executeTusMockUpload, executeTusRealUpload } from "../src/hostinger-node-tus-transport.mjs";

const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

test("mock PATCH failure can be resumed at the last acknowledged chunk", () => {
  const broken = createTusMockTransport([{ status: 204, offset: 4 }, { status: 503, offset: 4 }]);
  assert.throws(() => executeTusMockUpload({ bytes, chunkSize: 4, transport: broken }), /unexpected_tus_status/);
  assert.deepEqual(broken.requests, [{ offset: 0, length: 4 }, { offset: 4, length: 4 }]);
  const resumed = createTusMockTransport([{ status: 204, offset: 8 }, { status: 204, offset: 10 }]);
  const result = executeTusMockUpload({ bytes, chunkSize: 4, startOffset: 4, transport: resumed });
  assert.equal(result.complete, true);
  assert.equal(result.offset, 10);
  assert.equal(result.writesEnabled, false);
  assert.deepEqual(result.requests, [{ offset: 4, length: 4 }, { offset: 8, length: 2 }]);
});

test("mock transport rejects forged adapters, incorrect offsets and real writes", () => {
  assert.throws(() => executeTusMockUpload({ bytes, chunkSize: 4, transport: { send() {} } }), /tus_transport_not_mock/);
  const mismatch = createTusMockTransport([{ status: 204, offset: 5 }]);
  assert.throws(() => executeTusMockUpload({ bytes, chunkSize: 4, transport: mismatch }), /tus_offset_mismatch/);
  assert.throws(executeTusRealUpload, /hostinger_tus_write_blocked/);
});
