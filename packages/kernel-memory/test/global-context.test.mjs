import test from "node:test"; import assert from "node:assert/strict";
import {createGlobalContextV1,languageTiersV1} from "../src/global-context.mjs";
const base={language:"pt",locale:"pt-BR",market:"br",country:"br",timezone:"America/Sao_Paulo",currency:"brl",regulatoryRegion:"BR",languageTier:"certified"};
test("global context v1 is normalized and immutable",()=>{const x=createGlobalContextV1(base);assert.equal(x.market,"BR");assert.equal(x.currency,"BRL");assert.equal(x.locale,"pt-BR");assert.equal(Object.isFrozen(x),true);assert.deepEqual(languageTiersV1,["certified","supported","best_effort"])});
test("global context v1 rejects invalid or extra fields",()=>{assert.throws(()=>createGlobalContextV1({...base,locale:"pt"}),/locale invalid/);assert.throws(()=>createGlobalContextV1({...base,phone:"5548"}),/unsupported field: phone/)});
