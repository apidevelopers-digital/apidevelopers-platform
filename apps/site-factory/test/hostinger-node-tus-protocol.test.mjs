import test from "node:test";
import assert from "node:assert/strict";
import {validateTusProgress, assertTusWriteAllowed} from "../src/hostinger-node-tus-protocol.mjs";
test("valid offset progression", () => {
  assert.deepEqual(validateTusProgress({length:10,previous:0,status:204,offset:5}),{offset:5,complete:false});
  assert.deepEqual(validateTusProgress({length:10,previous:5,status:204,offset:10}),{offset:10,complete:true});
});
test("reject invalid offsets and statuses", () => {
  assert.throws(() => validateTusProgress({length:10,previous:5,status:204,offset:4}), /invalid_tus_offset/);
  assert.throws(() => validateTusProgress({length:10,previous:5,status:204,offset:11}), /invalid_tus_offset/);
  assert.throws(() => validateTusProgress({length:10,previous:5,status:401,offset:6}), /unexpected_tus_status/);
});
test("write blocked", () => assert.throws(assertTusWriteAllowed, /hostinger_tus_write_blocked/));
