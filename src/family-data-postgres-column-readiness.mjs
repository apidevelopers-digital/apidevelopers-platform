import { planFamilyDataPostgresSchemaReadiness } from "./family-data-postgres-schema-readiness.mjs";
const CONFIRM="FAMILY_DATA_COLUMN_READINESS_PROBE";
const SPEC=Object.freeze({
purchases:"purchase_id:text household_id:text merchant_id:text source_id:text batch_id:text external_order_id:text fiscal_access_key:text purchased_at:date currency:text subtotal:numeric discount:numeric total:numeric status:text reconciliation_status:text evidence_ids:jsonb",
products:"product_id:text canonical_name:text brand:text category:text package_quantity:numeric package_unit:text gtin:text domain:text is_food:bool",
purchase_items:"purchase_item_id:text purchase_id:text line_number:int4 raw_description:text product_id:text quantity:numeric quantity_unit:text measured_weight_kg:numeric unit_price:numeric line_discount:numeric line_total:numeric currency:text",
payments:"payment_id:text purchase_id:text method:text provider_label_raw:text amount:numeric currency:text installments:int4",
evidence:"evidence_id:text batch_id:text source_id:text kind:text sha256:text captured_at:timestamptz immutable:bool classification:text metadata:jsonb",
product_aliases:"alias_id:text product_id:text source_id:text raw_description:text normalized_description:text match_method:text confidence:numeric review_status:text"
});
const TABLES=Object.freeze(Object.keys(SPEC));
const EXPECTED=Object.freeze(Object.entries(SPEC).flatMap(([table_name,columns])=>
  columns.split(" ").map(pair=>{
    const [column_name,expected_udt]=pair.split(":");
    return Object.freeze({table_name,column_name,expected_udt});
  })
));
const KEYS=new Set(EXPECTED.map(e=>`${e.table_name}.${e.column_name}`));
export const FAMILY_DATA_REQUIRED_POSTGRES_COLUMNS=EXPECTED;
export const FAMILY_DATA_COLUMN_READINESS_CONFIRMATION=CONFIRM;
export function planFamilyDataPostgresColumnReadiness({pool,householdId,tenantId="homosapiens-id",schema="family_data"}={}){
 const p=planFamilyDataPostgresSchemaReadiness({pool,householdId,tenantId,schema});
 return Object.freeze({
  ready:p.ready,tenant_id:p.tenant_id,schema:p.schema,pool_checks:p.pool_checks,
  required_tables:TABLES,required_column_count:EXPECTED.length,
  confirmation_literal:CONFIRM,execution_requires_confirmation:true,
  catalog_columns_read_executed:false,data_rows_read:false,schema_mutated:false,
  credentials_exposed:false,deploy_executed:false
 });
}
export async function probeFamilyDataPostgresColumnReadiness({pool,householdId,tenantId="homosapiens-id",schema="family_data",execute=false,confirmation}={}){
 const p=planFamilyDataPostgresColumnReadiness({pool,householdId,tenantId,schema});
 if(!p.ready)throw new TypeError("family_data_column_preflight_failed");
 if(!execute)return Object.freeze({...p,status:"dry_run",checked_columns:0,missing_columns:null,type_mismatches:null});
 if(confirmation!==CONFIRM)throw new TypeError("explicit column readiness probe confirmation is required");
 let client;
 try{
  client=await pool.connect();
  if(!client||typeof client.query!=="function")throw new TypeError("PostgreSQL client with query() required");
  const r=await client.query(
   `SELECT table_name, column_name, udt_name FROM information_schema.columns
    WHERE table_schema=$1 AND table_name=ANY($2::text[])
    ORDER BY table_name, ordinal_position`,[p.schema,[...TABLES]]);
  const found=new Map();
  for(const row of r?.rows??[]){
   const key=`${row.table_name}.${row.column_name}`;
   if(KEYS.has(key))found.set(key,row.udt_name);
  }
  const missing=[],mismatch=[];
  for(const e of EXPECTED){
   const actual=found.get(`${e.table_name}.${e.column_name}`);
   if(actual===undefined)missing.push(e);
   else if(actual!==e.expected_udt)mismatch.push(Object.freeze({...e,actual_udt:String(actual)}));
  }
  return Object.freeze({...p,status:missing.length||mismatch.length?"not_ready":"ready",
   checked_columns:EXPECTED.length-missing.length,
   missing_columns:Object.freeze(missing),type_mismatches:Object.freeze(mismatch),
   catalog_columns_read_executed:true});
 }finally{if(client&&typeof client.release==="function")client.release();}
}
