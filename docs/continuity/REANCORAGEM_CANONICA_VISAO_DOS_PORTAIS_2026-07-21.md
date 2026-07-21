# REANCORAGEM CANÔNICA — VISÃO DOS PORTAIS

**Data:** 2026-07-21  
**Status:** PREPARADO_PARA_CONTINUIDADE  
**Escopo:** arquitetura, produto, experiência e governança dos portais da API Developers.digital  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch de referência:** `foundation/global-platform-bootstrap-20260715`  
**HEAD observado na elaboração:** `7295cebc23dd872946dbfe0abe2824a6a3cd1995`  
**Risco:** R2 — estratégico e arquitetural  
**Deploy:** NÃO_EXECUTADO  
**Release:** NÃO_PUBLICADA  

## 1. Objetivo

Esta reancoragem consolida o que foi definido sobre os portais da API Developers.digital.

A visão central é:

> Os portais não serão sistemas isolados e desconectados.  
> Serão superfícies especializadas sobre o mesmo núcleo canônico, com projeções próprias, permissões próprias e experiência adequada a cada público.

O Portal é uma camada de leitura, entendimento e operação assistida. Ele não substitui o domínio, o Kernel, a persistência, o Gateway ou as políticas de autorização.

## 2. Princípio arquitetural

A arquitetura dos portais segue esta direção:

```text
Fontes canônicas
  GitHub
  contratos
  Registry
  Knowledge Graph
  memória institucional
  persistência
  auditoria
        ↓
Projectors determinísticos
        ↓
Modelos derivados e snapshots
        ↓
API de leitura / adaptadores
        ↓
Portais especializados
```

Regras:

- a fonte canônica permanece fora da interface;
- o Portal consome projeções derivadas;
- projeções devem ser determinísticas;
- dados exibidos devem possuir origem e evidência;
- leitura e escrita são caminhos separados;
- a interface não decide nem executa por conta própria;
- nenhuma credencial pertence ao modelo de domínio ou à projeção;
- o Portal não se torna uma segunda fonte de verdade.

## 3. Uma plataforma, várias superfícies

A plataforma deve suportar diferentes famílias de portal sem duplicar o núcleo.

### 3.1 Portal Institucional

Público principal:

- liderança;
- governança;
- arquitetura;
- operação interna autorizada.

Exibe:

- visão da organização;
- produtos;
- capabilities;
- componentes;
- contratos;
- políticas;
- evidências;
- decisões;
- riscos;
- estado de evolução;
- documentação canônica.

Características:

- leitura institucional;
- alta rastreabilidade;
- navegação por relações;
- sem exposição de segredos;
- sem execução automática.

### 3.2 Portal Operacional

Público principal:

- operadores;
- suporte;
- equipes técnicas;
- responsáveis por serviços.

Exibe:

- saúde dos serviços;
- filas;
- tarefas;
- incidentes;
- workflows;
- builds;
- dependências;
- alertas;
- ações permitidas.

Características:

- leitura em tempo quase real quando houver fonte autorizada;
- ações sempre mediadas por Gateway, Policy e Audit;
- dry-run preferencial;
- confirmação explícita para ações sensíveis;
- registro de antes, depois e responsável.

### 3.3 Portal do Cliente

Público principal:

- clientes externos;
- administradores do tenant;
- usuários autorizados pelo cliente.

Exibe:

- consumo;
- chaves e acessos mascarados;
- produtos contratados;
- limites;
- eventos;
- integrações;
- documentação contextual;
- suporte;
- status do serviço.

Características:

- isolamento estrito por `tenant_id`;
- menor complexidade visual;
- linguagem orientada à tarefa;
- nenhuma visão de outros tenants;
- nenhuma exposição da arquitetura interna além do necessário.

### 3.4 Portal do Desenvolvedor

Público principal:

- desenvolvedores;
- integradores;
- parceiros;
- equipes de produto.

Exibe:

- catálogo de APIs;
- contratos;
- exemplos;
- schemas;
- ambientes;
- credenciais mascaradas;
- uso;
- erros;
- changelog;
- SDKs;
- testes e sandbox, quando aprovados.

Características:

- experiência semelhante a um developer console;
- documentação ligada ao contrato real;
- exemplos versionados;
- separação clara entre sandbox, staging e produção;
- nenhuma execução real sem autorização e ambiente correto.

### 3.5 Portal Administrativo

Público principal:

- administradores internos autorizados;
- governança;
- segurança;
- operação de plataforma.

Exibe:

- tenants;
- clientes;
- planos;
- limites;
- políticas;
- chaves;
- auditoria;
- incidentes;
- configurações;
- propostas pendentes.

Características:

- acesso mais restrito;
- trilha de auditoria obrigatória;
- princípio do menor privilégio;
- ações críticas com confirmação forte;
- preferência por operação reversível.

### 3.6 Portal de Aprendizado

Público principal:

- arquitetura;
- governança;
- liderança;
- revisão humana.

Exibe:

- memórias;
- findings;
- evidências;
- propostas;
- lições;
- lacunas;
- itens aguardando revisão humana.

Características:

- somente leitura;
- projeção determinística;
- nenhuma mutação;
- nenhuma execução;
- nenhuma aprovação automática;
- propostas continuam pendentes até decisão humana válida.

O runtime e a fachada inicial desta superfície já existem:

- `GET /v1/admin/learning`;
- `packages/portal-projector/src/learning-facade.mjs`;
- snapshot JSON derivado;
- proteção administrativa;
- metadados explícitos de somente leitura.

## 4. Componentes comuns a todos os portais

Os portais devem compartilhar capacidades comuns, sem copiar regras entre aplicações:

### Identidade e acesso

- autenticação;
- autorização;
- papéis;
- escopos;
- isolamento por tenant;
- expiração e rotação de acesso;
- auditoria de sessão.

### Navegação institucional

- busca;
- relações entre entidades;
- histórico;
- evidências;
- origem dos dados;
- versão;
- estado.

### Projeções

- modelos derivados por finalidade;
- schemas versionados;
- ordenação determinística;
- clones estruturados;
- nenhuma referência mutável ao estado interno.

### Observabilidade

- status;
- saúde;
- métricas;
- incidentes;
- logs autorizados e sanitizados;
- rastreabilidade por `request_id`, `correlation_id` ou equivalente.

### Ações

Qualquer ação iniciada no Portal deve seguir:

```text
Portal
  ↓
API Gateway
  ↓
autenticação e autorização
  ↓
Policy / Constitution / limites
  ↓
serviço de domínio ou Execution Gateway
  ↓
persistência transacional e outbox
  ↓
auditoria e evidência
  ↓
retorno ao Portal
```

O Portal nunca deve chamar diretamente banco, broker, provider ou infraestrutura sensível.

## 5. Modelo de dados do Portal

O modelo do Portal é derivado e orientado à leitura.

Entidades comuns podem incluir:

- `Organization`;
- `Product`;
- `Capability`;
- `Component`;
- `Contract`;
- `Policy`;
- `Decision`;
- `Evidence`;
- `Run`;
- `Incident`;
- `Client`;
- `Tenant`;
- `Usage`;
- `LearningMemory`;
- `Finding`;
- `Proposal`.

Cada item exibido deve, quando aplicável, carregar:

- identificador estável;
- tipo;
- versão;
- status;
- origem;
- data de geração;
- evidência;
- relações;
- classificação de acesso;
- tenant;
- estado de revisão.

## 6. Experiência visual

A linguagem visual dos portais deve ser consistente, mas adaptada ao público.

Princípios:

- moderno;
- limpo;
- utilitário;
- leitura rápida;
- densidade controlada;
- hierarquia clara;
- estados visuais consistentes;
- detalhes progressivos;
- ações sensíveis claramente separadas de leitura.

Padrões recomendados:

- visão geral com indicadores;
- navegação lateral por domínio;
- busca global;
- cards apenas quando agregarem entendimento;
- tabelas para inventário e operação;
- timeline para decisões, runs e incidentes;
- grafo para relações arquiteturais;
- drawers ou páginas de detalhe com evidências;
- estados `online`, `atenção`, `erro`, `bloqueado`, `rascunho`, `pendente`, `aprovado` e `arquivado`.

A interface deve evitar:

- painéis genéricos sem contexto;
- excesso de gráficos decorativos;
- mistura de ambientes;
- botões de ação sem consequência explícita;
- exposição de IDs ou dados técnicos sem tradução para o usuário;
- esconder evidência atrás de estados vagos.

## 7. Separação entre leitura e escrita

### Caminho de leitura

- consulta fonte autorizada;
- projeta modelo derivado;
- publica snapshot ou resposta;
- aplica filtros de acesso;
- exibe no Portal.

### Caminho de escrita

- usuário solicita ação;
- Gateway autentica;
- políticas validam;
- domínio processa;
- persistência registra;
- outbox propaga;
- auditoria preserva evidência;
- Portal recebe o resultado.

A escrita nunca deve ser simulada apenas alterando o estado visual da interface.

## 8. Tenant e privacidade

Regras obrigatórias:

- `tenant_id` opaco;
- nenhuma consulta cruzada entre tenants;
- nenhuma memória de um cliente aparece para outro;
- dados jurídicos e de saúde mantêm segregação reforçada;
- campos sensíveis devem ser mascarados;
- logs apresentados devem ser sanitizados;
- permissões devem ser avaliadas no backend;
- filtros de interface não substituem autorização.

## 9. Ambientes

Cada Portal deve declarar claramente o ambiente:

- local;
- sandbox;
- desenvolvimento;
- staging;
- produção.

Nunca misturar:

- credenciais;
- dados;
- indicadores;
- execuções;
- URLs;
- status de ambientes diferentes.

Uma ação em sandbox não autoriza ação em produção.

## 10. Estado atual implementado

A fundação já contém:

- `@apidevelopers/portal-projector`;
- leitura de Git e Markdown;
- extração tipada;
- integridade de modelos derivados;
- fachada institucional;
- armazenamento derivado;
- publisher institucional;
- API de leitura;
- adaptador HTTP separado;
- runtime protegido do Portal Learning;
- fachada determinística de aprendizado;
- workflows segmentados;
- documentação arquitetural;
- modelos de evidência e validação.

O Portal já é, portanto, mais que uma ideia visual: existe uma fundação técnica de projeção, publicação, leitura e integração.

## 11. O que ainda precisa ser definido

### Produto

- mapa final das superfícies;
- prioridades por público;
- jornadas principais;
- nomenclatura de cada Portal;
- quais superfícies serão aplicações separadas ou módulos da mesma aplicação.

### Design

- design system;
- layouts responsivos;
- componentes de tabela, timeline, grafo e evidência;
- estados vazios;
- acessibilidade;
- linguagem e microcopy.

### Segurança

- provedor de identidade;
- modelo final de RBAC/ABAC;
- sessões;
- MFA;
- política de administração;
- segregação de ambientes.

### Plataforma

- Backend for Frontend, se necessário;
- cache;
- atualização de snapshots;
- eventos em tempo real;
- paginação;
- busca;
- observabilidade do próprio Portal.

### Operação

- hospedagem;
- domínio;
- staging;
- deploy;
- rollback;
- SLO;
- suporte;
- runbook.

## 12. Sequência recomendada

### Fase 1 — Fundação comum

1. consolidar schemas de projeção;
2. definir identidade e autorização;
3. definir API de leitura comum;
4. consolidar auditoria e evidência;
5. formalizar isolamento por tenant.

### Fase 2 — Portal Institucional e Learning

1. catálogo institucional;
2. arquitetura navegável;
3. decisões e evidências;
4. tela de aprendizado;
5. propostas pendentes de revisão humana.

### Fase 3 — Portal do Desenvolvedor e Cliente

1. catálogo de APIs;
2. documentação contextual;
3. consumo e limites;
4. chaves mascaradas;
5. suporte e status.

### Fase 4 — Portal Operacional e Administrativo

1. saúde e incidentes;
2. filas e workflows;
3. tenants e planos;
4. ações governadas;
5. relatórios e auditoria operacional.

## 13. Contratos invioláveis

- o Portal não é fonte de verdade;
- projeções não alteram o domínio;
- leitura não concede escrita;
- interface não autoriza ação;
- nenhuma aprovação automática;
- nenhuma execução automática;
- nenhuma credencial em código ou snapshot;
- tenant não cruza tenant;
- toda ação sensível produz auditoria;
- toda informação relevante deve apontar para origem ou evidência;
- deploy, staging e produção continuam separados por gates explícitos.

## 14. Decisão arquitetural consolidada

A decisão candidata consolidada é:

> Construir uma plataforma de portais especializados, sustentada por um núcleo comum de identidade, autorização, projeções, evidências, auditoria e APIs. Cada portal adapta a experiência e o recorte de dados ao seu público, mas não duplica domínio, não cria fonte paralela de verdade e não executa ações fora do Gateway governado.

## 15. Próximo estado permitido

- revisão arquitetural e de produto;
- transformar esta visão em mapa de jornadas e módulos;
- definir o primeiro Portal visual a ser implementado;
- preparar wireframes e contratos de tela;
- continuar sem deploy até aprovação específica.

## 16. Relatório de governança

- `status`: PREPARADO_PARA_CONTINUIDADE
- `versão_origem`: portal foundation até 2026-07-21
- `alvo`: portais da API Developers.digital
- `risco`: R2
- `decisão_milena`: PENDENTE
- `execução_igor`: DOCUMENTAÇÃO_TÉCNICA
- `deploy`: NÃO_EXECUTADO
- `evidência_técnica`: componentes e commits existentes no repositório
- `próximo_estado_permitido`: revisão da visão e definição do primeiro portal visual
