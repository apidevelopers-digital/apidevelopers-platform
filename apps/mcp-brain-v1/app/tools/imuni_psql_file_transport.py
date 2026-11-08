from __future__ import annotations
import io,secrets,tarfile,urllib.parse
from typing import Any
from .imuni_psql_transport import IMUNI_POSTGRES_CONTAINER,docker_api_raw,docker_exec
IMUNI_DB_NAME="imuni_clinical"; IMUNI_DB_USER="imuni_app"; SQL_TMP_DIR="/tmp"

def tar_single_file(filename:str, content:bytes)->bytes:
    if "/" in filename or filename in {"",".",".."}:
        raise ValueError("unsafe filename")
    buf=io.BytesIO()
    with tarfile.open(fileobj=buf,mode="w") as tar:
        info=tarfile.TarInfo(filename); info.size=len(content); info.mode=0o600
        tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()

def put_text_file(container:str,directory:str,filename:str,content:str,timeout:int=25)->dict[str,Any]:
    qc=urllib.parse.quote(container,safe=""); qp=urllib.parse.quote(directory,safe="")
    return docker_api_raw("PUT",f"/containers/{qc}/archive?path={qp}",tar_single_file(filename,content.encode()),headers={"Content-Type":"application/x-tar"},timeout=timeout)

def psql_file_imuni(sql:str, variables:dict[str,str]|None=None, timeout:int=25)->dict[str,Any]:
    if not sql.strip():
        return {"ok":False,"blocked":True,"reason":"sql is required.","would_execute":False,"executed":False}
    fn="imuni_query_"+secrets.token_hex(8)+".sql"; remote=SQL_TMP_DIR+"/"+fn
    upload=put_text_file(IMUNI_POSTGRES_CONTAINER,SQL_TMP_DIR,fn,sql,timeout=timeout)
    if not upload.get("ok"):
        return {"ok":False,"stdout":"","stderr_tail":str(upload.get("raw") or upload.get("raw_bytes",b""))[-1000:],"exit_code":None,"executed":False}
    cmd=["psql","-U",IMUNI_DB_USER,"-d",IMUNI_DB_NAME,"-v","ON_ERROR_STOP=1","-At"]
    for k,v in (variables or {}).items():
        cmd+=["-v",f"{k}={v}"]
    cmd+=["-f",remote]
    try:
        result=docker_exec(IMUNI_POSTGRES_CONTAINER,cmd,timeout=timeout)
    finally:
        docker_exec(IMUNI_POSTGRES_CONTAINER,["rm","-f",remote],timeout=timeout)
    result["executed"]=bool(result.get("ok")); result["would_execute"]=bool(result.get("ok"))
    result["secret_value_exposed"]=False; result["dsn_exposed"]=False
    return result
