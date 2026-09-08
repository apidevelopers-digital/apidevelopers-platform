import React,{useState}from"react";
export default function JurimetricsPanel({client}){
 const[tribunal,setTribunal]=useState("TJSP"),[query,setQuery]=useState("responsabilidade civil"),[state,setState]=useState({busy:false,result:null,error:""});
 async function submit(e){e.preventDefault();setState({busy:true,result:null,error:""});try{const result=await client.jurimetrics({tribunal,query,limit:100});setState({busy:false,result,error:""})}catch(error){setState({busy:false,result:null,error:error?.message||"Jurimetria indisponível."})}}
 return <form className="pro-form" onSubmit={submit}><div className="pro-grid">
  <label>Tribunal<input value={tribunal} onChange={e=>setTribunal(e.target.value)}/></label>
  <label>Consulta<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
 </div><button className="primary" disabled={state.busy}>{state.busy?"Consultando…":"Executar jurimetria"}</button>
 <p className="pro-note">Consulta read-only. Nenhum dado é salvo no banco do Escritório.</p>
 {state.error?<p className="pro-error">{state.error}</p>:null}
 {state.result?<pre className="pro-result">{JSON.stringify(state.result,null,2)}</pre>:null}</form>
}