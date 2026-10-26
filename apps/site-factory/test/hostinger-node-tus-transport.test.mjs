import test from "node:test";
import assert from "node:assert/strict";
import { createTusMockTransport, executeTusMockUpload, executeTusRealUpload } from "../src/hostinger-node-tus-transport.mjs";

const bytes = new Uint8Array(10);
test("mock transport sends PATCH chunks with offsets and no network", () => {
  const transport = createTusMockTransport([{status:204,offset:4},{status:204,offset:8},{status:204,offset:10}]);
  const result = executeTusMockUpload({bytes,chunkSize:4,transport});
  assert.equal(result.mode,"mock");
  assert.equal(result.writesEnabled,false);
  assert.equal(result.complete,true);
  assert.deepEqual(result.requests,[{offset:0,length:4},{offset:4,length:4},{offset:8,length:2}]);
});
test("mock transport supports resume", () => {
  const transport = createTusMockTransport([{status:204,offset:7},{status:204,offset:10}]);
  assert.deepEqual(executeTusMockUpload({bytes,chunkSize:3,startOffset:4,transport}).requests,[{offset:4,length:3},{offset:7,length:3}]);
});
test("mock transport rejects invalid offsets and statuses", () => {
  assert.throws(()=>executeTusMockUpload({bytes,chunkSize:5,transport:createTusMockTransport([{status:204,offset:4}])}),/tus_offset_mismatch/);
  assert.throws(()=>executeTusMockUpload({bytes,chunkSize:5,transport:createTusMockTransport([{status:401,offset:5}])}),/unexpected_tus_status/);
  assert.throws(()=>executeTusMockUpload({bytes,chunkSize:5,transport:createTusMockTransport([])}),/missing_tus_response/);
  assert.throws(()=>executeTusMockUpload({bytes,chunkSize:10,transport:createTusMockTransport([{status:204,offset:10},{status:204,offset:10}])}),/unused_tus_responses/);
});
test("mock boundary rejects external transport and real writes", () => {
  assert.throws(()=>executeTusMockUpload({bytes,chunkSize:5,transport:{send(){return {status:204,offset:5}}}}),/tus_transport_not_mock/);
  assert.throws(()=>executeTusRealUpload(),/hostinger_tus_write_blocked/);
});
test("mock transport rejects unsafe inputs", () => {
  const transport=createTusMockTransport([]);
  assert.throws(()=>executeTusMockUpload({bytes:"abc",chunkSize:1,transport}),/invalid_bytes/);
  assert.throws(()=>executeTusMockUpload({bytes,chunkSize:0,tansport}),/invalid_chunk_size/);
  assert.throws((()=>executeTusMockUpload({bytes,chunkSize:2,startOffset:11,transport}),/invalid_start_offset/);
  assert.throws(()=>createTusMockTransport(null),/invalid_mock_responses/);
});
