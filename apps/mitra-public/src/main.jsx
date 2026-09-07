import React from "react";
import { createRoot } from "react-dom/client";
import PublicResearchPanel from "./PublicResearchPanel.jsx";
import "./styles.css";

const capabilities = [
  ["Pesquisa jurídica", "Fontes públicas", "Busque, compare e normalize referências jurídicas com fonte e contexto visíveis."],
  ["Jurimetria", "Análise", "Converta dados processuais em leitura operacional para apoiar estratégia e priorização."],
  ["Operação assistida", "Fluxos", "Conduza tarefas com checkpoints claros e confirmação antes de qualquer persistência."],
  ["Memória com contexto", "Privado", "No modo Escritório, memória e documentos ficam ligados a cliente, caso e permissões."],
];

function Mark() {
  return <span className="mark" aria-hidden="true"><i/><i/><i/></span>;
}

function App() {
  return (
    <main>
      <header className="nav">
        <a className="brand" href="#top"><Mark/>Mitra</a>
        <nav><a href="#capacidades">Capacidades</a><a href="#seguranca">Segurança</a><a href="#planos">Planos</a></nav>
        <a className="pill" href="#acesso">Entrar →</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">● Preview de produto · modo público</span>
          <h1>Inteligência jurídica <em>para trabalhar, não só pesquisar.</em></h1>
          <p>A Mitra reúne pesquisa jurídica pública, navegação, jurimetria e assistência operacional em uma experiência preparada para evoluir até o escritório completo.</p>
          <div className="actions"><a className="primary" href="#demo">Explorar a Mitra →</a><a className="secondary" href="#capacidades">Ver como funciona</a></div>
          <small>Pesquisa pública sem acesso a banco privado. Login, cobrança e persistência continuam desativados nesta etapa.</small>
        </div>

        <PublicResearchPanel Mark={Mark} />
      </section>

      <section className="sources"><span>Pesquisa pública preparada para</span><b>CNJ / DataJud</b><b>Legislação</b><b>DOU</b><b>Proposições</b></section>

      <section className="section" id="capacidades">
        <div className="heading"><div><span className="kicker">Assistente jurídica operacional</span><h2>Da descoberta à ação, com contexto preservado.</h2></div><p>A experiência pública apresenta fontes abertas e o produto. Dados privados só entram em contexto autenticado e autorizado.</p></div>
        <div className="cards">
          {capabilities.map(([title, tag, text], i) => <article className="card" key={title}><div><span>0{i+1}</span><b>{tag}</b></div><h3>{title}</h3><p>{text}</p><i>↗</i></article>)}
        </div>
      </section>

      <section className="section boundary" id="seguranca">
        <div className="boundary-copy"><span className="kicker">Separação por desenho</span><h2>Público de um lado. Escritório do outro.</h2><p>A Mitra pública não acessa clientes, memórias, documentos ou processos privados. Login futuro não quebra essa fronteira: contexto privado depende de identidade, workspace e permissões.</p><strong>◇ Sem banco privado no modo público.</strong></div>
        <div className="boundary-box">
          <article><span>Pública</span><h3>Descoberta e pesquisa</h3><ul><li>✓ Fontes jurídicas públicas</li><li>✓ Navegação e produto</li><li>✓ Chatbot comercial</li><li>✓ Entrada para login</li></ul></article>
          <div>TRUST BOUNDARY</div>
          <article className="private"><span>Escritório</span><h3>Operação autenticada</h3><ul><li>• Clientes e casos</li><li>• Documentos e processos</li><li>• Memória por contexto</li><li>• Confirmação antes de persistir</li></ul></article>
        </div>
      </section>

      <section className="section assistant">
        <div><span className="kicker">Chatbot comercial</span><h2>Conheça a Mitra conversando com ela.</h2><p>Nesta fase, o chat é só interface. A integração futura poderá explicar o produto, orientar pesquisa pública e qualificar oportunidades sem acessar contexto privado.</p></div>
        <div className="chat">
          <header><span><Mark/><b>Mitra</b></span><small>Preview</small></header>
          <div className="messages"><p>Posso mostrar como a Mitra pesquisa fontes públicas e evolui para um ambiente jurídico operacional.</p><p className="me">Qual a diferença entre a versão pública e a versão para escritório?</p><p>A pública usa informação aberta e produto. O modo Escritório adiciona clientes, documentos, processos e memória sob autenticação.</p></div>
          <div className="input">Digite sua pergunta… <button type="button">→</button></div>
        </div>
      </section>

      <section className="section" id="planos">
        <div className="heading"><div><span className="kicker">Produto comercial</span><h2>Estrutura pronta para evoluir até SaaS.</h2></div><p>Valores, cobrança e entitlements permanecem desativados nesta prévia.</p></div>
        <div className="plans">
          <article><span>Pública</span><h3>Pesquisa</h3><p>Descoberta, pesquisa aberta e chatbot de produto.</p><b>Preview</b></article>
          <article className="featured"><span>Profissional</span><h3>Mitra Pro</h3><p>Pesquisa, jurimetria, memória de trabalho e fluxos assistidos.</p><b>Em definição comercial</b></article>
          <article><span>Escritório</span><h3>Mitra Office</h3><p>Clientes, casos, documentos, permissões e auditoria.</p><b>Futuro SaaS</b></article>
        </div>
      </section>

      <section className="section access" id="acesso">
        <div><span className="kicker">Acesso</span><h2>A Mitra está sendo preparada para operação comercial.</h2><p>O login nesta prévia é apenas visual. Autenticação real será integrada em etapa separada, com revisão de identidade, tenant, sessão e permissões.</p></div>
        <div className="login"><span className="brand"><Mark/>Entrar na Mitra</span><label>E-mail profissional<input type="email" placeholder="voce@escritorio.com.br" readOnly /></label><button type="button" className="primary">Continuar →</button><small>Autenticação real não está habilitada nesta versão.</small></div>
      </section>

      <footer className="site-footer"><span className="brand"><Mark/>Mitra</span><span>Inteligência jurídica operacional · API Developers.digital</span><span>Preview público · sem dados privados</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
