function rows(v){return Array.isArray(v)?v:Array.isArray(v?.data)?v.data:Array.isArray(v?.items)?v.items:Array.isArray(v?.results)?v.results:[]}
function values(x,out=[]){if(x==null)return out;if(typeof x!=="object"){out.push(String(x));return out}if(Array.isArray(x)){x.forEach(y=>values(y,out));return out}Object.values(x).forEach(y=>values(y,out));return out}
function num(v){const n=Number(v);return Number.isFinite(n)?n:undefined}
function txt(v){const s=String(v??"").trim();return s||undefined}
export function buildFamilyDataPostgresDiscoveryReport(input={}){
  const vps=input.vps||{};
  const status=String(vps.status??vps.state??vps.power_status??"").toLowerCase();
  const firewall=Boolean(vps.firewall_group_id??vps.firewallGroupId);
  const dbs=rows(input.databases);
  let pg=0,my=0;
  for(const db of dbs){
    const joined=values(db).join(" ");
    const port=num(db.port??db.database_port??db.db_port);
    if(port===5432||/postgres|postgresql|pg[_-]?/i.test(joined))pg++;
    if(port===3306||/mysql|mariadb/i.test(joined))my++;
  }
  const remotes=rows(input.remoteAccess);
  const broad=remotes.filter(r=>values(r).some(v=>v==="%"||v.includes("0.0.0.0/0")||v.includes("::/0"))).length;
  const backups=rows(input.backups);
  const builds=rows(input.nodeBuilds);
  const allBuildValues=values(builds);
  const deploy=allBuildValues.some(v=>v.includes("deploy/hostinger-gateway-runtime"));
  const main=allBuildValues.some(v=>v==="main"||v.includes("refs/heads/main"));
  const vpsPresent=Boolean(input.vps);
  const running=["running","started","online"].includes(status);
  const blockers=[];
  const warnings=[];
  if(!vpsPresent)blockers.push("vps_not_confirmed");
  if(vpsPresent&&!running)blockers.push("vps_not_running");
  if(!pg)blockers.push("postgres_not_detected");
  if(!firewall)blockers.push("vps_firewall_group_not_configured");
  if(!backups.length)blockers.push("vps_backup_not_confirmed");
  if(!deploy&&!main)warnings.push("gateway_runtime_branch_unknown");
  if(deploy&&!main)warnings.push("gateway_runtime_not_proven_current_main");
  if(my)warnings.push("mysql_mariadb_hosting_database_present_not_postgres");
  if(broad)warnings.push("broad_remote_database_access_present");
  return Object.freeze({
    source:"family_data_postgres_mcp_discovery_adapter_v1",
    mode:"read_only",
    target_domain:input.targetDomain??"gateway.apidevelopers.digital",
    target_tenant:input.targetTenant??"homosapiens-id",
    target_household:input.targetHousehold??"family.grocery.bistek.v1",
    safe_for_mcp_read_only_tool:true,
    mutates_infrastructure:false,
    reads_credentials:false,
    opens_network_connection_to_database:false,
    executes_sql:false,
    installs_packages:false,
    deploys_runtime:false,
    vps:Object.freeze({present:vpsPresent,running,os:txt(vps.os??vps.operating_system??vps.template?.name),firewall_configured:firewall}),
    backups:Object.freeze({present:backups.length>0,count:backups.length}),
    databases:Object.freeze({count:dbs.length,postgres_evidence_present:pg>0,postgres_candidate_count:pg,mysql_compatible_count:my,mysql_compatible_port_present:my>0}),
    remote_access:Object.freeze({entries:remotes.length,broad_remote_access_present:broad>0,broad_remote_access_count:broad}),
    node_builds:Object.freeze({count:builds.length,deploy_runtime_branch_seen:deploy,main_branch_seen:main}),
    blockers:Object.freeze(blockers),
    warnings:Object.freeze(warnings),
    decision:blockers.length===0?"GO_FOR_APPROVAL_PACKAGE":"NO_GO_FOR_LIVE_POSTGRES_PROBE"
  });
}
export const FAMILY_DATA_POSTGRES_DISCOVERY_ADAPTER=Object.freeze({DEFAULT_POSTGRES_PORT:5432,MYSQL_COMPATIBLE_PORT:3306});
