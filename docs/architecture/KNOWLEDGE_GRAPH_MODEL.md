# KNOWLEDGE GRAPH MODEL

**Status:** Canônico — versão inicial  
**Versão:** 0.1.0  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Responsável:** Produto / Arquitetura  
**Fonte de verdade:** Git

## 1. Objetivo

Este documento define o grafo institucional que conecta estratégia, produto, arquitetura, implementação, validação, operação e continuidade.

O grafo deve permitir que qualquer janela de inteligência artificial, colaborador ou automação descubra:

- onde começar;
- qual documento possui autoridade;
- qual capacidade está sendo construída;
- quais entidades pertencem ao domínio;
- qual código implementa a capacidade;
- quais testes e workflows validam o trabalho;
- qual evidência sustenta o estado atual;
- qual é o próximo passo autorizado.

O grafo não cria uma nova fonte de verdade. Ele organiza relações entre fontes versionadas no Git.

## 2. Cadeia canônica

```text
Empresa
→ Área
→ Produto
→ Plataforma
→ Domínio
→ Capacidade
→ Entidade
→ Contrato
→ Componente
→ Repositório
→ Caminho
→ Teste
→ Workflow
→ Evidência
→ Estado
→ Próxima iteração
```

O Portal deve navegar essa cadeia, nunca manter uma taxonomia independente.

## 3. Tipos de nós

| Tipo | Prefixo | Função |
|---|---|---|
| Empresa | `ORG` | raiz institucional |
| Área | `AREA` | responsabilidade organizacional |
| Produto | `PROD` | oferta ou resultado de negócio |
| Plataforma | `PLAT` | base tecnológica compartilhada |
| Domínio | `DOM` | limite funcional e arquitetural |
| Capacidade | `CAP` | habilidade observável da plataforma |
| Entidade | `ENT` | objeto com identidade ou ciclo de vida |
| Contrato | `CTR` | schema, manifesto, API ou interface |
| Componente | `CMP` | pacote, serviço, aplicação ou módulo |
| Repositório | `REPO` | unidade Git |
| Documento | `DOC` | fonte canônica de conhecimento |
| Teste | `TEST` | validação executável |
| Workflow | `WF` | validação automatizada |
| Evidência | `EVD` | resultado verificável |
| Estado | `STATE` | fotografia factual |
| Iteração | `ITER` | próximo lote autorizado |
| Ator | `ACTOR` | pessoa, IA ou automação |
| Ambiente | `ENV` | contexto de execução |
| Release | `REL` | versão promovida |
| Incidente | `INC` | falha operacional registrada |

## 4. Relações permitidas

| Relação | Significado |
|---|---|
| `CONTAINS` | contém estruturalmente |
| `OWNS` | possui responsabilidade |
| `IMPLEMENTS` | implementa capacidade ou contrato |
| `DEPENDS_ON` | depende de outro nó |
| `GOVERNS` | define regras para |
| `DESCRIBES` | documenta |
| `VALIDATES` | valida |
| `PRODUCES` | produz evidência ou evento |
| `CONSUMES` | consome contrato, evento ou dado |
| `PERSISTS` | persiste entidade ou projeção |
| `EXPOSES` | expõe API, interface ou visão |
| `DERIVES_FROM` | deriva de fonte canônica |
| `BLOCKS` | bloqueia avanço |
| `SUPERSEDES` | substitui versão anterior |
| `RUNS_IN` | executa em ambiente |
| `PROMOTES_TO` | promove para estado ou ambiente |
| `OBSERVES` | monitora |
| `AUDITS` | registra trilha |
| `NEXT` | aponta para a próxima iteração |
| `REFERENCES` | referência não proprietária |

## 5. Regras de identidade

Cada nó deve possuir:

- ID estável;
- tipo;
- nome;
- descrição;
- owner;
- estado;
- maturidade;
- fonte canônica;
- data da última conferência;
- evidências;
- relações;
- bloqueadores, quando existirem.

Formato recomendado:

```text
<TIPO>-<DOMINIO>-<NOME>-<NUMERO>
```

Exemplos:

- `CAP-PERSISTENCE-DURABLE-STORE-001`
- `ENT-USAGE-USAGE-EVENT-001`
- `CMP-PERSISTENCE-PERSISTENCE-CORE-001`
- `WF-PERSISTENCE-VALIDATION-001`
- `DOC-COMPANY-WORLD-INDEX-001`

Caminhos de arquivo podem mudar. IDs não devem mudar por causa disso.

## 6. Autoridade

A ordem de autoridade é:

1. documento canônico da área;
2. estado mais recente versionado no Git;
3. decisão arquitetural registrada;
4. implementação e testes;
5. conversa atual.

Uma conversa nunca pode sobrescrever silenciosamente um nó canônico.

Quando houver divergência:

1. registrar o conflito;
2. identificar a fonte autorizada mais recente;
3. corrigir o nó ou a relação;
4. registrar decisão arquitetural quando necessário;
5. atualizar estado e próxima iteração.

## 7. Caminho mínimo de continuidade

Toda nova janela deve conseguir resolver:

```text
COMPANY_WORLD_INDEX
→ AI_WORK_GUIDE
→ CURRENT_STATE
→ NEXT_ITERATION
→ domínio
→ capacidade
→ componente
→ workflow
→ evidência
```

Se esse caminho estiver quebrado, a continuidade institucional está incompleta.

## 8. Exemplo persistence-core

```text
PLAT-GLOBAL-PLATFORM-001
‒ CONTAINS → DOM-PERSISTENCE-001
→ CONTAINS → CAP-PERSISTENCE-DURABLE-STORE-001
→ IMPLEMENTS → CMP-PERSISTENCE-PERSISTENCE-CORE-001
‒ VALIDATES → WF-PERSISTENCE-VALIDATION-001
‒ PRODUCES → EVD-PERSISTENCE-CI-001
```

Relações adicionais esperadas:

- o componente implementa contratos de repositório e checksum;
- persiste registros e eventos de outbox;
- testes validam atomicidade, concorrência e corrupção 
- a evidência sustenta o estado registrado em `CURRENT_STATE.md`.

## 9. Consumo pelo Portal

O Portal deve:

- ler o grafo versionado;
- mostrar origem, estado e evidência;
- permitir navegação da empresa até o código;
- permitir navegação do código até a capacidade;
- destacar nós sem owner, fonte ou evidência;
- exibir bloqueadores e histórico;
- respeitar permissões e aprovações;
- nunca declarar um estado sem evidência.

O Portal não deve:

- inventar IDs;
- manter entidades fora do Git sem reconciliação;
- alterar estado canônico sem fluxo aprovado;
- ocultar divergências;
- promover capacidade por aparência visual.

## 10. Validações futuras

O grafo deverá validar automaticamente:

- IDs duplicados;
- relações para nós inexistentes;
- nós sem owner;
- capacidades sem entidades;
- componentes sem capacidade;
- workflows sem domínio;
- estados sem evidência;
- documentos canônicos sem índice;
- caminhos quebrados;
- versões incompatíveis.

## 11. Critério de prontidão

O modelo estará pronto para o Portal quando:

- Capability Registry e Entity Registry estiverem indexados;
- `plan-core`, `entitlement-core` e `persistence-core` estiverem mapeados;
- os tipos de nós e relações estiverem estáveis;
- o grafo puder ser gerado de forma deterministica;
- toda visão do Portal apontar para a fonte no Git;
- não existir catálogo paralelo.

## 12. Próximo passo

1. registrar `persistence-core` no Capability Registry;
2. completar entidades de persistência, plano e entitlement;
3. definir `PORTAL_DATA_MODEL.md`;
4. criar o primeiro formato físico versionado do grafo 
5. adicionar validações automáticas;
6. atualizar `CURRENT_STATE.md`.

## 13. Regra permanente

> Todo trabalho importante deve ser localizavel no grafo institucional: por que existe, quem governa, onde está implementado, como é validado, qual evidência sustenta seu estado e qual é o próximo passo.
