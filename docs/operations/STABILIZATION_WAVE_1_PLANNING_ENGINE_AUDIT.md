# Auditoria da Onda 1 — Planning Engine

**Destinatário:** Torre de Comando  
**Data de referência:** 2026-07-21  
**Modo da auditoria:** somente leitura  
**Branch auditada:** `stabilization/wave-1-planning-engine-20260721`  
**HEAD auditado:** `0058b9733aec7c653a80273a48d9ff30b3225982`  
**Base confirmada:** `main` em `e5aef84f36d00dfae694911f44be9f7f6edcaf79`  
**Fonte controlada:** `foundation/global-platform-bootstrap-20260715` em `ea066ac5da9050c9b5010b23d88bef3df509ed8b`

## 1. Parecer executivo

A branch da Onda 1 está corretamente ancorada na base registrada. No momento da auditoria, ela continha apenas o documento de definição da onda e ainda não continha a implementação do pacote canônico.

A implementação prevista em `packages/kernel-planning` depende de `@apidevelopers/contracts@0.1.0`, pacote privado presente na fonte controlada, mas ausente em `main`. Transportar essa dependência sem autorização ampliaria a onda para outro domínio.

Também existe risco crítico de falsa compatibilidade: o shim legado proposto preserva identidade de exports, mas a API comportamental da implementação canônica difere da implementação atual em `scripts/lib/planning-engine.mjs`.

**Estado recomendado à Torre de Comando:**

> **BLOQUEADA — decisão de dependência e compatibilidade necessária antes da implementação.**

## 2. Checklist do escopo permitido

### Arquivos autorizados

- [ ] `packages/kernel-planning/README.md`
- [ ] `packages/kernel-planning/package.json`
- [ ] `packages/kernel-planning/src/index.mjs`
- [ ] `packages/kernel-planning/src/governed.mjs`
- [ ] `packages/kernel-planning/test/index.test.mjs`
- [ ] `packages/kernel-planning/test/legacy-compatibility.test.mjs`
- [ ] `scripts/lib/planning-engine.mjs`
- [ ] documentação específica da Onda 1

### Alterações condicionais

- [ ] manifesto raiz mínimo, somente para reconhecer o workspace;
- [ ] configuração mínima de workspace necessária para executar o pacote;
- [ ] lockfile apenas quando inevitável e reproduzível;
- [ ] workflow exclusivo do Planning Engine, somente se os checks atuais não forem suficientes;
- [ ] no máximo três microcommits coerentes:
  1. pacote canônico;
  2. shim e compatibilidade;
  3. CI ou documentação indispensável.

### Regras obrigatórias

- [ ] implementação real somente em `packages/kernel-planning/src/index.mjs`;
- [ ] shim legado sem lógica própria;
- [ ] nenhuma duplicação da implementação;
- [ ] API legada preservada ou divergências formalmente aprovadas;
- [ ] branch continuamente ancorada na base registrada;
- [ ] no máximo 12 arquivos alterados;
- [ ] qualquer ampliação de escopo previamente autorizada.

## 3. Checklist do escopo proibido

### Domínios proibidos

- [ ] Portal;
- [ ] runtime comercial;
- [ ] mídia;
- [ ] observabilidade;
- [ ] VNNOX;
- [ ] WhatsApp;
- [ ] financeiro;
- [ ] autenticação;
- [ ] banco de dados;
- [ ] outros kernels;
- [ ] contratos compartilhados sem autorização específica.

### Operações proibidas

- [ ] abrir PR antes da conferência da Torre;
- [ ] merge;
- [ ] deploy;
- [ ] alteração em `main`;
- [ ] merge ou incorporação da mega-branch;
- [ ] funcionalidade nova;
- [ ] refatoração oportunista;
- [ ] alteração de CI global;
- [ ] lógica própria no shim;
- [ ] segredo, credencial ou configuração sensível;
- [ ] prosseguir com commits concorrentes não reconciliados;
- [ ] continuar se testes globais falharem por causa da onda.

## 4. Riscos de compatibilidade do shim legado

### 4.1 Compatibilidade de importação não garante compatibilidade comportamental

O teste de compatibilidade da fonte controlada verifica somente:

- mesmas chaves exportadas;
- identidade de `PlanningEngine`;
- identidade de `createPlanningEngine`;
- identidade de `planningPriorities`.

Isso prova reexportação, mas não prova compatibilidade dos consumidores existentes.

**Risco:** crítico.

### 4.2 Assinatura de `plan()` diferente

Implementação atual em `main`:

```js
engine.plan(reasoningReport, {
  maxPlans,
  maxStepsPerPlan
})
```

Implementação canônica:

```js
engine.plan(reflection, {
  maxProposals,
  context,
  impactAnalysis
})
```

Impactos possíveis:

- `maxPlans` deixa de produzir efeito;
- `maxStepsPerPlan` desaparece;
- opções antigas podem ser ignoradas silenciosamente;
- validações e mensagens de erro mudam.

**Risco:** crítico.

### 4.3 Formato de saída diferente

A implementação legada produz planos e etapas. A implementação canônica produz relatório consultivo com propostas, estado decisório, evidências, revisões e restrições de governança.

Consumidores que esperem campos antigos podem quebrar mesmo com o import preservado.

**Risco:** crítico.

### 4.4 Identificadores diferentes

A implementação legada usa IDs previsíveis como:

```text
plan.0001
plan.0001.step.001
```

A implementação canônica deriva IDs de reflexão, assunto e categoria.

Possíveis impactos:

- snapshots;
- logs;
- referências persistidas;
- comparações de resultados;
- integrações que tratem IDs como estáveis.

**Risco:** alto.

### 4.5 Entrada aceita com semântica diferente

A implementação legada foi criada para `reasoningReport.conclusions`.

A implementação canônica aceita `findings` ou `conclusions`, mas agrupa, prioriza e governa os itens de forma diferente.

**Risco:** alto.

### 4.6 Erros observáveis diferentes

Tipos, mensagens e condições de erro podem mudar. Consumidores ou testes que dependam de mensagens específicas podem falhar.

**Risco:** médio.

### Controle obrigatório

O shim deve permanecer um reexport puro. A compatibilidade deve ser comprovada ou implementada na camada canônica.

A Torre deve escolher uma estratégia:

1. adaptar o pacote canônico para aceitar o contrato antigo;
2. criar adaptador de compatibilidade explicitamente versionado;
3. declarar quebra de contrato e planejar migração.

A terceira opção não atende ao objetivo atual de preservar consumidores existentes.

## 5. Dependências externas possíveis

### 5.1 Dependência confirmada e bloqueante

`@apidevelopers/contracts@0.1.0`

O pacote Planning Engine importa:

- `assertCognitiveHandoffContract`;
- `assertPlanningReportContract`;
- `createCognitiveHandoff`.

Esse pacote:

- é privado;
- existe na fonte controlada;
- não existe na base `main`;
- não pode ser presumido como disponível em registry público;
- pertence a uma superfície compartilhada maior que o Planning Engine.

A Torre deve decidir entre:

- onda separada para contratos;
- ampliação explícita da Onda 1;
- retirada de `governed.mjs` e do subpath `./governed` no primeiro corte.

### 5.2 Dependências de runtime

- Node.js 22 ou superior;
- ESM por meio de `"type": "module"`;
- `structuredClone`;
- resolução correta de exports;
- workspace npm ou mecanismo equivalente.

### 5.3 Dependências arquiteturais

Upstream esperado:

```text
kernel-reflection → kernel-planning
```

Downstream esperado:

```text
kernel-planning → kernel-decision
```

Contextos compartilhados possíveis:

- `tenantContext`;
- `cycleId`;
- contratos de relatório;
- contratos de handoff cognitivo;
- análise de impacto;
- evidências;
- revisões de governança.

### 5.4 Dependências operacionais

- manifesto raiz com `workspaces`;
- lockfile compatível;
- linking local de `@apidevelopers/contracts`;
- workflow em Node 22;
- consumidores internos do caminho legado;
- snapshots ou integrações dependentes do formato antigo.

## 6. Testes mínimos obrigatórios

### A. Sintaxe e carregamento

- [ ] `node --check packages/kernel-planning/src/index.mjs`
- [ ] `node --check packages/kernel-planning/src/governed.mjs`
- [ ] `node --check scripts/lib/planning-engine.mjs`
- [ ] importação do pacote raiz;
- [ ] importação do subpath `./governed`;
- [ ] importação pelo caminho legado.

### B. Testes canônicos do pacote

- [ ] rejeição de reflexão inválida;
- [ ] agrupamento por assunto e categoria;
- [ ] ordenação determinística;
- [ ] preservação das referências da reflexão;
- [ ] exigência de aprovação humana;
- [ ] proibição de mutação automática;
- [ ] proibição de aprovação automática;
- [ ] proibição de execução automática;
- [ ] evidência ausente tratada explicitamente;
- [ ] bloqueio de conflito constitucional;
- [ ] não mutação da entrada;
- [ ] determinismo com clock fixo;
- [ ] limite de propostas;
- [ ] alias `deliberate()` equivalente a `plan()`.

### C. Compatibilidade de exportpãão

- [ ] mesmas chaves exportadas;
- [ ] identidade de `PlanningEngine`;
- [ ] identidade de `createPlanningEngine`;
- [ ] identidade de `planningPriorities`;
- [ ] shim sem funções, classes ou regras próprias.

### D. Compatibilidade comportamental legada

Capturar fixtures no SHA-base e executá-las novamente após a migração:

- [ ] `reasoningReport.conclusions`;
- [ ] `maxPlans`;
- [ ] `maxStepsPerPlan`;
- [ ] ordem por severidade;
- [ ] agrupamento antigo;
- [ ] formato completo do relatório;
- [ ] formato dos planos;
- [ ] formato das etapas;
- [ ] IDs de planos e etapas;
- [ ] mensagens de erro;
- [ ] conclusões vazias;
- [ ] entradas incompletas.

Cada divergência deve ser eliminada ou aprovada formalmente.

### E. Fluxo governado

Quando `governed.mjs` permanecer na onda:

- [ ] validação do handoff de entrada;
- [ ] rejeição de rota diferente de `kernel-reflection → kernel-planning`;
- [ ] validação do relatório;
- [ ] preservação de `cycleId`;
- [ ] preservação de `tenantId`;
- [ ] preservação de `sourceHandoffId`;
- [ ] handoff válido `kernel-planning → kernel-decision`;
- [ ] teste real com `@apidevelopers/contracts@0.1.0`.

### F. Instalação e workspace

- [ ] instalação limpa em Node 22;
- [ ] resolução local das dependências;
- [ ] testes no diretório do pacote;
- [ ] testes pelo workspace raiz;
- [ ] ausência de dependências não declaradas;
- [ ] ausência de registry privado não autorizado.

### G. Regressão e escopo

- [ ] checks globais aplicáveis;
- [ ] `git diff --name-only` dentro da lista permitida;
- [ ] no máximo 12 arquivos;
- [ ] nenhum domínio proibido;
- [ ] nenhum segredo;
- [ ] nenhum artefato temporário;
- [ ] no máximo três microcommits.

## 7. Critérios para considerar a onda pronta para revisão

- [ ] decisão formal sobre `@apidevelopers/contracts`;
- [ ] nenhuma dependência externa incorporada sem autorização;
- [ ] branch ainda descendente da base registrada;
- [ ] nenhuma incorporação da mega-branch;
- [ ] HEAD final documentado;
- [ ] implementação apenas no pacote canônico;
- [ ] shim comprovadamente puro;
- [ ] testes canônicos verdes;
- [ ] testes de identidade de exports verdes;
- [ ] testes comportamentais legados verdes;
- [ ] fluxo governado verde ou formalmente retirado da onda;
- [ ] instalação limpa e workspace comprovados;
- [ ] checks globais aplicáveis verdes;
- [ ] diff apenas com arquivos autorizados;
- [ ] no máximo 12 arquivos alterados;
- [ ] no máximo três microcommits coerentes;
- [ ] comandos, resultados e SHAs registrados;
- [ ] relatório final entregue à Torre;
- [ ] nenhum PR, merge ou deploy antes da autorização.

## 8. Divergências encontradas

1. A fonte canônica depende de pacote privado ausente em `main`.
2. O teste legado da fonte comprova somente identidade de exports.
3. A API comportamental legada difere da API canônica.
4. `main` não possui ainda a estrutura de workspace necessária.
5. O pacote não estava presente na branch alvo no momento da auditoria.
6. A branch não possui proteção ativa; o controle de escritor único depende de governança operacional.

## 9. Recomendação final

**Estado:** `BLOQUEADA — DECISÃO DE DEPENDÊNCIA E COMPATIBILIDADE NECESSÁRIA`.

Antes de autorizar implementação, a Torre de Comando deve decidir:

1. se `@apidevelopers/contracts` será tratado em onda separada;
2. se `governed.mjs` ficará fora do primeiro corte;
3. ou se haverá ampliação explícita do escopo.

Também deve definir se compatibilidade legada significa:

- somente preservar o caminho de importação; ou
- preservar entradas, opções, resultados, IDs e erros.

A interpretação operacionalmente segura é **compatibilidade comportamental integral**.
