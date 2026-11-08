import test from "node:test";
import assert from "node:assert/strict";
import { simulateTusChunks } from "../src/hostinger-node-tus-simulator.mjs";

const bytes = new Uint8Array(10);

test("simulates complete chunked upload without writes", () => {
  const result = simulateTusChunks({
    bytes, chunkSize: 4,
    responses: [{status:204,offset:4},{status:204,offset:8},{status:204,offset:10}]
  });
  assert.equal(result.mode, "simulation");
  assert.equal(result.writesEnabled, false);
  assert.equal(result.complete, true);
  assert.equal(result.offset, 10);
  assert.deepEqual(result.chunks, [{start:0,end:4},{start:4,end:8},{start:8,end:10}]);
});

test("simulates resume from a previously verified offset", () => {
  const result = simulateTusChunks({
    bytes, chunkSize: 3, startOffset: 4,
    responses: [{status:204,offset:7},{status:204,offset:10}]
  });
  assert.deepEqual(result.chunks, [{start:4,end:7},{start:7,end:10}]);
});

test("rejects mismatched offset, HTTP errors, and incomplete responses", () => {
  const args = {bytes,chunkSize:5};
  assert.throws(() => simulateTusChunks({...args,responses:[{status:204,offset:4}]}), /tus_offset_mismatch/);
  assert.throws(() => simulateTusChunks({...args,responses:[{status:401,offset:5}]}), /unexpected_tus_status/);
  assert.throws(() => simulateTusChunks({...args,responses:[]}), /missing_tus_response/);
  assert.throws(() => simulateTusChunks({...args,responses:[{status:204,offset:5},{status:204,offset:10},{status:204,offset:10}]}), /unused_tus_responses/);
});

test("rejects unsafe parameters", () => {
  assert.throws(() => simulateTusChunks({bytes,chunkSize:0,responses:[]}), /invalid_chunk_size/);
  assert.throws(() => simulateTusChunks({bytes,chunkSize:2,startOffset:11,responses:[]}), /invalid_start_offset/);
  assert.throws(() => simulateTusChunks({bytes,chunkSize:2,responses:null}), /invalid_responses/);
  assert.throws(() => simulateTusChunks({bytes:"abc",chunkSize:2,responses:[]}), /invalid_bytes/);
});
