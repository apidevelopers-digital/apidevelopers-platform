import React,{useState}from"react";
function lines(v){return String(v||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,30)}
export default function AssistantPanel({client}){
 const[question,setQuestion]=useState("Quais teses e fontes devo revisar para um caso de responsabilidade civil médica?");
 const[facts,setFacts]=useState("Houve prestação de serviço de saúde.\nExiste controvérsia sobre nexo causal.");
 const[tribunal,setTribunal]=useState("STJ");
 const[state,setState]=useState({busy:false,result:null,error:""});
 async function submit(event){event.preventDefault();setState({busy:true,result:null,error:""});try{const result=await client.analyze({question,facts:lines(facts),tribunal,limit:10});setState({busy:false,result,error:""})}catch(error){setState({busy:false,result:null,error:error?.message||"Análise indisponível."})}}
 return <form className="pro-form" onSubmit={submit}>
  <label>Pergunta jurídica<textarea value={question} onChange={e=>setQuestion(e.target.value)} maxLength={5000}/></label>
  <label>Fatos relevantes <small>um por linha</small><textarea value={facts} onChange={e=>setFacts(e.target.value)}/></label>
  <label>Tribunal<input value={tribunal} onChange={e=>setTribunal(e.target.value)} maxLength={50}/></label>
  <button className="primary" disabled={state.busy}>{state.busy?"Analisando…":"Analisar com fontes"}</button>
  {state.error?<p className="pro-error">{state.error}</p>:null}
  {state.result?<pre className="pro-result">{JSON.stringify(state.result,null,2)}</pre>:null}
 </form>
}