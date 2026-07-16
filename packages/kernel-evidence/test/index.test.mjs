import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceRegistry, verifyEvidence, evidenceStatuses, evidenceTypes } from "../src/index.mjs";

const base = { evidenceId:"ev.1", tenantId:"tenant.a", type:"audit", source:{module:"test"}, payload:{ok:true} };
const clock = () => "2026-07-16T21:00:00.000Z";

test("creates verifiable evidence",()=>{ const r=createEvidenceRegistry({clock}).record(base); assert.equal(verifyEvidence(r),true); });
test("is deterministic across key order",()=>{ const a=createEvidenceRegistry({clock}).record(base); const b=createEvidenceRegistry({clock}).record({...base,payload:{ok:true}}); assert.equal(a.integrity.digest,b.integrity.digest); });
test("detects tampering",()=>{ const r=createEvidenceRegistry({clock}).record(base); r.payload.ok=false; assert.equal(verifyEvidence(r),false); });
test("blocks secrets recursively",()=>{ assert.throws(()=>createEvidenceRegistry({clock}).record({...base,payload:{nested:{api_key:"x"}}}),/secret-like/); });
test("rejects duplicate ids",()=>{ const reg=createEvidenceRegistry({clock}); reg.record(base); assert.throws(()=>reg.record(base),/duplicate/); });
test("enforces tenant scoped reads",()=>{ const reg=createEvidenceRegistry({clock}); reg.record(base); assert.equal(reg.get("ev.1",{tenantId:"tenant.b"}),null); });
test("lists deterministically",()=>{ const reg=createEvidenceRegistry({clock}); reg.record({...base,evidenceId:"b"}); reg.record({...base,evidenceId:"a"}); assert.deepEqual(reg.list().map(x=>x.evidenceId),["a","b"]); });
test("revokes without deleting",()=>{ const reg=createEvidenceRegistry({clock}); reg.record(base); const r=reg.revoke("ev.1",{tenantId:"tenant.a",reason:"test"}); assert.equal(r.status,"revoked"); assert.equal(verifyEvidence(r),true); });
test("returns defensive clones",()=>{ const reg=createEvidenceRegistry({clock}); const r=reg.record(base); r.payload.ok=false; assert.equal(reg.get("ev.1").payload.ok,true); });
test("exports canonical vocabularies",()=>{ assert.ok(evidenceStatuses.includes("active")); assert.ok(evidenceTypes.includes("runtime-report")); });
