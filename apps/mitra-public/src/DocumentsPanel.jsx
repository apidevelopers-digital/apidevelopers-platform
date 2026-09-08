import React,{useState}from"react";
function lines(v){return String(v||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,30)}
export default function DocumentsPanel({client}){
 const[type,setType]=useState("legal_brief"),[objective,setObjective]=useState("Organizar argumentos e fontes para revisão de responsabilidade civil.");
 const[facts,setFacts]=useState("Houve prestação de serviço.\nA causalidade ainda precisa ser comprovada."),[instructions,setInstructions]=useState("Separar fatos, fundamentos a validar e fontes que precisam ser conferidas.");
 const[state,setState]=useState({busy:false,result:null,error:""});
 async function submit(e){e.preventDefault();setState({busy:true,result:null,error:""});try{const result=await client.documentPreview({documentType:type,objective,facts:lines(facts),instructions,citations:[]});setState({busy:false,result,error:""})}catch(error){setState({busy:false,result:null,error:error?.message||"Rascunho indisponível."})}}
 return <form className="pro-form" onSubmit={submit}>
  <label>Tipo<select value={type} onChange={e=>setType(e.target.value)}><option value="legal_brief">Memorial jurídico</option><option value="petition">Petição</option><option value="appeal">Recurso</option><option value="motion">Manifestação</option><option value="contract">Contrato</option><option value="agreement">Acordo</option></select></label>
  <label>Objetivo<textarea value={objective} onChange={e=>setObjective(e.target.value)}/></label>
  <label>Fatos <small>um por linha</small><textarea value={facts} onChange={e=>setFacts(e.target.value)}/></label>
  <label>Instruções de revisão<textarea value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
  <button className="primary" disabled={state.busy}>{state.busy?"Estruturando…":"Criar rascunho estrutural"}</button>
  <p className="pro-note">Rascunho efêmero. Sem protocolo, assinatura, persistência ou conclusão jurídica final.</p>
  {state.error?<p className="pro-error">{state.error}</p>:null}
  {state.result?.content?<pre className="pro-result pro-document">{state.result.content}</pre>:state.result?<pre className="pro-result">{JSON.stringify(state.result,null,2)}</pre>:null}
 </form>
}