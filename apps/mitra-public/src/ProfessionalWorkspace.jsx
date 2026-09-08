import React,{useEffect,useMemo,useState}from"react";
import PublicResearchPanel from"./PublicResearchPanel.jsx";
import AssistantPanel from"./AssistantPanel.jsx";
import JurimetricsPanel from"./JurimetricsPanel.jsx";
import DocumentsPanel from"./DocumentsPanel.jsx";
import VeritasPanel from"./VeritasPanel.jsx";
import{createProfessionalClient}from"./professional-client.js";
import"./professional.css";

const TABS=[["research","Pesquisa"],["assistant","Assistente"],["jurimetrics","Jurimetria"],["documents","Documentos"],["veritas","Veritas"]];

export default function ProfessionalWorkspace({Mark}){
 const baseUrl=String(import.meta.env.VITE_MITRA_PUBLIC_API_BASE_URL||"").trim();
 const client=useMemo(()=>createProfessionalClient({baseUrl}),[baseUrl]);
 const[tab,setTab]=useState("research"),[health,setHealth]=useState(null);
 useEffect(()=>{let active=true;client.health().then(v=>active&&setHealth(v)).catch(e=>active&&setHealth({ok:false,error:e?.code||"unavailable"}));return()=>{active=false}},[client]);
 const ready=health?.ok===true;
 return <section className="professional-workspace" id="profissional">
  <header className="pro-head"><div><span className="kicker">Mitra Profissional · Bloco A</span><h2>Uma bancada jurídica para pesquisar, analisar, medir e estruturar.</h2></div>
  <p>Experiência para o advogado usar como SaaS. O banco privado, clientes e memória do Escritório ficam fora desta fronteira.</p></header>
  <div className={`pro-status ${ready?"is-ready":"is-limited"}`}><span>{ready?"● Runtime profissional conectado":"● Capacidades protegidas em modo seguro"}</span>
   <small>{ready?"Assistente, jurimetria e Veritas disponíveis via gateway.":"Pesquisa e rascunhos efêmeros continuam separados; recursos protegidos ficam fail-closed até a configuração server-side."}</small>
  </div>
  <nav className="pro-tabs" aria-label="Ferramentas da Mitra Profissional">{TABS.map(([id,label])=><button type="button" key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</nav>
  <div className="pro-panel">
   {tab==="research"?<PublicResearchPanel Mark={Mark}/>:null}
   {tab==="assistant"?<AssistantPanel client={client}/>:null}
   {tab==="jurimetrics"?<JurimetricsPanel client={client}/>:null}
   {tab==="documents"?<DocumentsPanel client={client}/>:null}
   {tab==="veritas"?<VeritasPanel client={client}/>:null}
  </div>
  <footer className="pro-boundary">Sem banco do Escritório · sem gravação automática · revisão humana obrigatória · credenciais somente server-side</footer>
 </section>
}