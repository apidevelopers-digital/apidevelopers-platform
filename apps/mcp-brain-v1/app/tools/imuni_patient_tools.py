from __future__ import annotations
import hashlib,hmac,os
from typing import Any
from .imuni_base_tools import base_result
from .imuni_patient_create_sql import create_patient_real
ENV="IMUNI_R5_INTERNAL_CREDENTIAL_SHA256"
CONF="IGOR_APROVA_R5_IMUNI_PATIENT_REAL_V1"
PATIENT_TOOL_DEFINITIONS=[
{"name":"imuni.patient.create_REAL","risk":"R5","category":"imuni_db","mode":"real_patient_write","plugin_ready":True,"would_execute":True,"requires_confirmation":True,"requires_private_operator_credential":True,"required_confirmation":"R5_CONFIRMATION_AND_PRIVATE_OPERATOR_CREDENTIAL_REQUIRED","description":"Cria paciente real no Imuni com dados pessoais criptografados, hashes para busca, grant admin para Igor e auditoria sem payload clinico bruto.","input_schema":{"type":"object","properties":{"confirmacao":{"type":"string"},"operator_credential":{"type":"string"},"full_name":{"type":"string","minLength":2},"cpf":{"type":"string"},"birth_date":{"type":"string"},"phone":{"type":"string"},"email":{"type":"string"},"emergency_contact":{"type":"string"}},"required":["confirmacao","operator_credential","full_name"]}},
{"name":"imuni.patient.search_REAL","risk":"R5","category":"imuni_db","mode":"real_patient_read","plugin_ready":True,"would_execute":True,"requires_confirmation":True,"requires_private_operator_credential":True,"required_confirmation":"R5_CONFIRMATION_AND_PRIVATE_OPERATOR_CREDENTIAL_REQUIRED","description":"Busca paciente real por codigo ou CPF com gate R5 e credencial interna. SQL real permanece bloqueado ate PR revisado.","input_schema":{"type":"object","properties":{"confirmacao":{"type":"string"},"operator_credential":{"type":"string"},"patient_code":{"type":"string"},"cpf":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":20}},"required":["confirmacao","operator_credential"]}},
{"name":"imuni.patient.archive_REAL","risk":"R5","category":"imuni_db","mode":"real_patient_archive","plugin_ready":True,"would_execute":True,"requires_confirmation":True,"requires_private_operator_credential":True,"required_confirmation":"R5_CONFIRMATION_AND_PRIVATE_OPERATOR_CREDENTIAL_REQUIRED","description":"Arquiva paciente real por codigo. Nao faz hard delete. SQL real permanece bloqueado ate PR revisado.","input_schema":{"type":"object","properties":{"confirmacao":{"type":"string"},"operator_credential":{"type":"string"},"patient_code":{"type":"string"},"reason":{"type":"string"}},"required":["confirmacao","operator_credential","patient_code"]}},
]
def is_patient_tool(tool:str)->bool: return any(x["name"]==tool for x in PATIENT_TOOL_DEFINITIONS)
def _cred(args:dict[str,Any])->bool:
    exp=os.environ.get(ENV,"").strip(); got=str(args.get("operator_credential") or "")
    return bool(exp and got and hmac.compare_digest(hashlib.sha256(got.encode()).hexdigest(),exp))
def _blocked(tool:str,reason:str)->dict[str,Any]:
    return base_result(tool,{"ok":False,"blocked":True,"reason":reason,"would_execute":False,"executed":False,"clinical_data_persisted":False,"real_patient_data_persisted":False,"secret_value_exposed":False,"dsn_exposed":False})
def _gate(tool:str,args:dict[str,Any])->dict[str,Any]|None:
    if args.get("confirmacao")!=CONF: return _blocked(tool,"human R5 confirmation required.")
    if not _cred(args): return _blocked(tool,"internal server-side credential required.")
    return None
def _limit(tool:str,args:dict[str,Any])->dict[str,Any]|None:
    if "limit" not in args: return None
    try: n=int(args.get("limit") or 10)
    except (TypeError,ValueError): return _blocked(tool,"limit must be an integer between 1 and 20.")
    return None if 1<=n<=20 else _blocked(tool,"limit must be an integer between 1 and 20.")
def _not_enabled(tool:str)->dict[str,Any]:
    return base_result(tool,{"ok":False,"blocked":True,"reason":"patient REAL SQL operation is intentionally pending a follow-up reviewed implementation.","would_execute":False,"executed":False,"real_patient_data_persisted":False,"clinical_payload_persisted":False,"hard_delete":False,"secret_value_exposed":False,"dsn_exposed":False})
def call_patient_tool(tool:str,args:dict[str,Any]|None=None)->dict[str,Any]:
    args=args or {}
    if tool=="imuni.patient.create_REAL":
        if b:=_gate(tool,args): return b
        return create_patient_real(tool,args)
    if tool in {"imuni.patient.search_REAL","imuni.patient.archive_REAL"}:
        if e:=_limit(tool,args): return e
        if b:=_gate(tool,args): return b
        return _not_enabled(tool)
    return {"tool":tool,"result":{"ok":False,"error":"unknown imuni patient tool","would_execute":False}}
