from __future__ import annotations
import hashlib
from typing import Any
from .imuni_base_tools import base_result
from .imuni_exec_utils import parse_key_value_rows
from .imuni_practitioner_tools import _docker_exec_fixed
def _digits(v:Any)->str: return "".join(c for c in str(v or "") if c.isdigit())
def _sha(v:str|None)->str|None: return hashlib.sha256(v.encode()).hexdigest() if v else None
def _lit(v:Any)->str: return "null" if v is None else "'" + str(v).replace("'","''") + "'"
def _sql(q:str)->dict[str,Any]:
    return _docker_exec_fixed("imuni-postgres",["psql","-U","imuni_app","-d","imuni_clinical","-v","ON_ERROR_STOP=1","-At","-c",q],timeout=25)
def create_patient_real(tool:str,args:dict[str,Any])->dict[str,Any]:
    name=str(args.get("full_name") or "").strip()
    if len(name)<2:
        return base_result(tool,{"ok":False,"blocked":True,"reason":"full_name is required.","would_execute":False,"executed":False,"real_patient_data_persisted":False,"secret_value_exposed":False,"dsn_exposed":False})
    key=str(args["operator_credential"])
    cpfh=_sha(_digits(args.get("cpf")))
    phone=str(args.get("phone") or "").strip() or None
    phoneh=_sha(_digits(phone))
    email=str(args.get("email") or "").strip().lower()
    emailh=_sha(email)
    birth=str(args.get("birth_date") or "").strip() or None
    emer=str(args.get("emergency_contact") or "").strip() or None
    q=f"""
with doctor as (
  select p.id practitioner_id,p.tenant_id
  from imuni.practitioners p join imuni.tenants t on t.id=p.tenant_id
  where t.slug='imuni-igor-private' and p.crm='18700' and p.crm_uf='SC' and p.status='active'
  limit 1
), generated as (
  select 'IMUNI-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8)) patient_code
), patient as (
  insert into imuni.patients (
    tenant_id,patient_code,full_name_encrypted,cpf_hash,birth_date_encrypted,
    phone_encrypted,phone_hash,email_encrypted,email_hash,emergency_contact_encrypted,status,created_by
  )
  select doctor.tenant_id,generated.patient_code,
    encode(pgp_sym_encrypt({_lit(name)},{_lit(key)}),'base64'),
    {_lit(cpfh)},
    case when {_lit(birth)} is null then null else encode(pgp_sym_encrypt({_lit(birth)},{_lit(key)}),'base64') end,
    case when {_lit(phone)} is null then null else encode(pgp_sym_encrypt({_lit(phone)},{_lit(key)}),'base64') end,
    {_lit(phoneh)},
    case when {_lit(email)}='' then null else encode(pgp_sym_encrypt({_lit(email)},{_lit(key)}),'base64') end,
    {_lit(emailh)},
    case when {_lit(emer)} is null then null else encode(pgp_sym_encrypt({_lit(emer)},{_lit(key)}),'base64') end,
    'active',doctor.practitioner_id
  from doctor,generated
  returning id,tenant_id,patient_code,status,created_by
), grant_admin as (
  insert into imuni.access_grants (tenant_id,practitioner_id,patient_id,scope,status,reason)
  select tenant_id,created_by,id,'admin','active','patient.create_REAL' from patient
  on conflict (tenant_id,practitioner_id,patient_id,scope)
  do update set status='active',reason=excluded.reason,revoked_at=null
  returning id
), audit as (
  insert into imuni_audit.events (tenant_id,actor_id,actor_role,action,resource_type,resource_id,patient_id_hash,metadata_json)
  select tenant_id,created_by,'physician_admin','patient.create_REAL','patient',id,encode(digest(id::text,'sha256'),'hex'),
    jsonb_build_object('tool','imuni.patient.create_REAL','cpf_raw_stored',false,'encrypted_fields',jsonb_build_array('full_name','birth_date','phone','email','emergency_contact'))
  from patient returning id
)
select 'patient_id='||id::text||chr(10)||
       'tenant_id='||tenant_id::text||chr(10)||
       'patient_code='||patient_code||chr(10)||
       'status='||status||chr(10)||
       'created_by='||created_by::text||chr(10)||
       'access_grants_created='||(select count(*)::text from grant_admin)||chr(10)||
       'audit_events_created='||(select count(*)::text from audit)
from patient;
"""
    r=_sql(q)
    rows=parse_key_value_rows(r)
    fields=rows[0] if rows else {}
    ok=bool(r.get("ok") and fields.get("patient_id"))
    return base_result(tool,{"ok":ok,"would_execute":ok,"executed":ok,"database":"imuni_clinical","patient":fields,"access_grants_created":fields.get("access_grants_created"),"audit_events_created":fields.get("audit_events_created"),"cpf_raw_stored":False,"encrypted_fields":["full_name","birth_date","phone","email","emergency_contact"],"real_patient_data_persisted":ok,"clinical_payload_persisted":False,"secret_value_exposed":False,"dsn_exposed":False,"diagnostic_error_tail":r.get("stderr_tail") if not r.get("ok") else ""})
