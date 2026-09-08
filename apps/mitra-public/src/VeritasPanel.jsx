import React,{useState}from"react";
export default function VeritasPanel({client}){
 const[mode,setMode]=useState("claim_precheck"),[claim,setClaim]=useState("A norma informada estava vigente na data analisada."),[source,setSource]=useState("Fonte oficial"),[citation,setCitation]=useState("Referência a confirmar");
 const[state,setState]=useState({busy:false,result:null,error:""});
 async function submit(e){e.preventDefault();setState({busy:true,result:null,error:""});try{const result=await client.veritas({mode,claim,evidence:{source,citation}});setState({busy:false,result,error:""})}catch(error){setState({busy:false,result:null,error:error?.message||"Verificação indisponível."})}}
 return <form className="pro-form" onSubmit={submit}>
  <label>Modo<select value={mode} onChange={e=>setMode(e.target.value)}><option value="claim_precheck">Pré-checagem</option><option value="claim_semantic">Semântica</option><option value="normative_validity">Vigência normativa</option></select></label>
  <label>Afirmação<textarea value={claim} onChange={e=>setClaim(e.target.value)}/></label>
  <div className="pro-grid"><label>Fonte<input value={source} onChange={e=>setSource(e.target.value)}/></label><label>Citação<input value={citation} onChange={e=>setCitation(e.target.value)}/></label></div>
  <button className="primary" disabled={state.busy}>{state.busy?"Verificando…":"Verificar com Veritas"}</button>
  {state.error?<p className="pro-error">{state.error}</p>:null}
  {state.result?<pre className="pro-result">{JSON.stringify(state.result,null,2)}</pre>:null}
 </form>
}