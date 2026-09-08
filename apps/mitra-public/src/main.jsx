import React from "react";
import{createRoot}from"react-dom/client";
import ProfessionalWorkspace from"./ProfessionalWorkspace.jsx";
import"./styles.css";
function Mark(){return <span className="mark" aria-hidden="true"><i/><i/><i/></span>}
function App(){return <main>
 <header className="nav"><a className="brand" href="#top"><Mark/>Mitra</a><nav><a href="#profissional">Profissional</a><a href="#seguranca">Segurança</a></nav><a className="pill" href="#profissional">Usar Mitra →</a></header>
 <section className="hero" id="top"><div className="hero-copy"><span className="eyebrow">● Mitra Profissional · Bloco A</span><h1>A bancada jurídica do advogado, <em>em uma única experiência.</em></h1><p>Pesquisa com fontes, assistente retrieval-first, jurimetria read-only, documentos governados e Veritas — sem acessar o banco privado do Escritório.</p><div className="actions"><a className="primary" href="#profissional">Abrir bancada →</a></div></div><div className="hero-side"><span>MITRA / PROFESSIONAL</span><strong>5</strong><p>capacidades integradas</p><ul><li>Pesquisa</li><li>Assistente</li><li>Jurimetria</li><li>Documentos</li><li>Veritas</li></ul></div></section>
 <section className="sources"><span>Preparada para</span><b>Fontes oficiais</b><b>CNJ / DataJud</b><b>Câmara</b><b>Lex</b><b>Veritas</b></section>
 <ProfessionalWorkspace Mark={Mark}/>
 <section className="section boundary" id="seguranca"><div className="boundary-copy"><span className="kicker">Trust boundary</span><h2>Profissional de um lado. Escritório do outro.</h2><p>O modo Profissional não recebe client_id, dossier, menória privada ou sessão do escritório. Credenciais de serviço ficam server-side e nenhuma pesquisa autoriza escrita.</p><strong>◇ Sem banco privado no modo Profissional.</strong></div><div className="boundary-box"><article><span>Profissional</span><h3>Efêmero</h3><ul><li>✓ Pesquisa</li><li>✓ Análise</li><li>✓ Jurimetria</li><li>✓ Rascunhos</li><li>✓ Veritas</li></ul></article><div>TRUST BOUNDARY</div><article className="private"><span>Escritório · Bloco B</span><h3>Privado</h3><ul><li>• Clientes</li><li>• Casos</li><li>• Documentos</li><li>• Memória</li><li>• Equipe e permissões</li></ul></article></div></section>
 <footer className="site-footer"><span className="brand"><Mark/>Mitra</span><span>Inteligência jurídica operacional · API Developers.digital</span><span>Revisão humana obrigatória</span></footer>
 </main>}
createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
