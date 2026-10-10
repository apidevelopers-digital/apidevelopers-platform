import test from "node:test";
import assert from "node:assert/strict";
import {
  planFamilyDataPostgresColumnReadiness, probeFamilyDataPostgresColumnReadiness,
  FAMILY_DATA_COLUMN_READINESS_CONFIRMATION as CONFIRM,
  FAMILY_DATA_REQUIRED_POSTGRES_COLUMNS as REQUIRED
} from "../src/family-data-postgres-column-readiness.mjs";

function poolFixture({rows=REQUIRED.map(({table_name,column_name,expected_udt})=>({table_name,column_name,udt_name:expected_udt})),failure=false}={}){
  const calls=[];
  return {
    calls,
    async query(){throw new Error("pool.query forbidden");},
    async connect(){
      calls.push(["connect"]);
      return {
        async query(sql,params){
          calls.push(["query",sql,params]);
          if(failure)throw new Error("catalog_failed");
          return {rows};
        },
        release(){calls.push(["release"]);}
      };
    }
  };
}
const args=(pool,opts={})=>({pool,householdId:"hh_test",...opts});

test("side-effect-free plan validates six tables",()=>{
  const pool=poolFixture();
  const p=planFamilyDataPostgresColumnReadiness(args(pool));
  assert.equal(p.ready,true);
  assert.equal(p.required_tables.length,6);
  assert.equal(p.required_column_count,REQUIRED.length);
  assert.equal(p.catalog_columns_read_executed,false);
  assert.equal(p.data_rows_read,false);
  assert.equal(p.schema_mutated,false);
  assert.equal(pool.calls.length,0);
});
test("dry-run performs no connection",async()=>{
  const pool=poolFixture();
  const p=await probeFamilyDataPostgresColumnReadiness(args(pool));
  assert.equal(p.status,"dry_run");
  assert.equal(p.missing_columns,null);
  assert.equal(pool.calls.length,0);
});
test("explicit confirmation required before any catalog access",async()=>{
  const pool=poolFixture();
  await assert.rejects(probeFamilyDataPostgresColumnReadiness(args(pool,{execute:true})),/explicit column readiness/);
  assert.equal(pool.calls.length,0);
});
test("confirmed compatible metadata is ready, read-only, released",async()=>{
  const pool=poolFixture();
  const p=await probeFamilyDataPostgresColumnReadiness(args(pool,{execute:true,confirmation:CONFIRM}));
  assert.equal(p.status,"ready");
  assert.equal(p.catalog_columns_read_executed,true);
  assert.equal(p.data_rows_read,false);
  assert.equal(p.schema_mutated,false);
  assert.deepEqual(p.missing_columns,[]);
  assert.deepEqual(p.type_mismatches,[]);
  assert.equal(p.checked_columns,REQUIRED.length);
  assert.deepEqual(pool.calls.map(c=>c[0]),["connect","query","release"]);
  assert.match(pool.calls[1][1],/FROM information_schema\.columns/);
  assert.equal(pool.calls[1][2][0],"family_data");
});
test("missing and mismatched columns fail readiness",async()=>{
  const rows=REQUIRED.filter(e=>!(e.table_name==="purchases"&&e.column_name==="household_id"))
    .map(e=>({table_name:e.table_name,column_name:e.column_name,
      udt_name:e.table_name==="evidence"&&e.column_name==="metadata"?"text":e.expected_udt}));
  const pool=poolFixture({rows});
  const p=await probeFamilyDataPostgresColumnReadiness(args(pool,{execute:true,confirmation:CONFIRM}));
  assert.equal(p.status,"not_ready");
  assert.deepEqual(p.missing_columns,[{table_name:"purchases",column_name:"household_id",expected_udt:"text"}]);
  assert.deepEqual(p.type_mismatches,[{table_name:"evidence",column_name:"metadata",expected_udt:"jsonb",actual_udt:"text"}]);
});
test("catalog failure releases client",async()=>{
  const pool=poolFixture({failure:true});
  await assert.rejects(probeFamilyDataPostgresColumnReadiness(args(pool,{execute:true,confirmation:CONFIRM})),/catalog_failed/);
  assert.deepEqual(pool.calls.map(c=>c[0]),["connect","query","release"]);
});
test("unsafe schema is rejected before any connection",async()=>{
  const pool=poolFixture();
  await assert.rejects(probeFamilyDataPostgresColumnReadiness(args(pool,{schema:"public;DROP",execute:true,confirmation:CONFIRM})),/schema identifier is invalid/);
  assert.equal(pool.calls.length,0);
});
test("invalid tenant or household is denied before connection",async()=>{
  const pool=poolFixture();
  await assert.rejects(probeFamilyDataPostgresColumnReadiness(args(pool,{tenantId:"other"})),/preflight_failed/);
  await assert.rejects(probeFamilyDataPostgresColumnReadiness({pool}),/preflight_failed/);
  assert.equal(pool.calls.length,0);
});
