# MATRIZ OFICIAL DE DEPENDÊNCIAS E CONTRATOS — API Developers.digital

**Data da conferência:** 2026-07-18  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Commit-âncora técnico:** `64f53298b4828896156aeb44097190ae3b3c1169`  
**Status:** MATRIZ_OFICIAL_ATUALIZADA  
**Escopo:** `packages/`  
**Merge / deploy:** NÃO EXECUTADOS

## 1. Inventário oficial

Foram confirmados **16 diretórios**:

- **14 pacotes implementados**;
- **2 módulos documentais:** `auth` e `tenancy`.

O contrato mínimo de tenancy está implementado no pacote compartilhado `@apidevelopers/contracts`, mas o diretório `packages/tenancy` ainda não constitui pacote executável próprio.

## 2. Regra de integração

Os pacotes comunicam-se por:

1. contratos públicos versionados;
2. relatórios e envelopes imutáveis;
3. identificadores canônicos;
4. testes de integração;
5. gates de política, autorização, evidência e auditoria.

Dependência npm direta não é requisito para existir vínculo lógico. O vínculo institucional deve ser comprovado por contrato público e teste.

## 3. Matriz resumida dos 16 diretórios

| Diretório | Estado | Contrato / função principal | Relação principal |
|---|---|---|---|
| `auth` | DOCUMENTAL | identidade e autorização | futuro vínculo com tenancy, policy e governance |
| `contracts` | IMPLEMENTADO | IDs, envelopes, tenancy e handoffs cognitivos | base transversal |
| `kernel-audit` | IMPLEMENTADO | auditoria | recebe runtime/evidence; alimenta evolution |
| `kernel-constitution` | IMPLEMENTADO | decisão constitucional | antecede policy e governance |
| `kernel-decision` | IMPLEMENTADO | decisão formal | recebe planning; alimenta policy/runtime |
| `kernel-evidence` | IMPLEMENTADO | evidência verificável | recebe runtime; alimenta audit |
| `kernel-evolution` | IMPLEMENTADO | propostas de evolução | recebe audit; alimenta governance |
| `kernel-governance` | IMPLEMENTADO | governança e autorização | consolida o ciclo |
| `kernel-memory` | IMPLEMENTADO | memória append-only | produz snapshot para reasoning |
| `kernel-planning` | IMPLEMENTADO | planos e propostas | recebe reflection; alimenta decision |
| `kernel-policy` | IMPLEMENTADO | decisão de política | antecede runtime |
| `kernel-reasoning` | IMPLEMENTADO | relatório de raciocínio | recebe memory; alimenta reflection |
| `kernel-reflection` | IMPLEMENTADO | findings e reflexão | recebe reasoning; alimenta planning |
| `kernel-runtime` | IMPLEMENTADO | execução governada | recebe decisão/policy; produz evidence |
| `registry` | IMPLEMENTADO | catálogo de capacidades | descoberta e promoção controlada |
| `tenancy` | DOCUMENTAL | isolamento por tenant | contrato mínimo disponível em `contracts` |

## 4. Cadeias formalizadas

### Pipeline cognitivo

`kernel-memory → kernel-reasoning → kernel-reflection → kernel-planning`

Contrato público:

`packages/contracts/src/cognitive-pipeline.mjs`

Valida:

- payload por etapa;
- transições permitidas;
- `tenantContext`;
- imutabilidade;
- bloqueio de aprovação e execução.

### Tenancy transversal

Contrato público:

`packages/contracts/src/tenancy-context.mjs`

Regras:

- `tenantId` opaco;
- isolamento estrito;
- acesso cross-tenant bloqueado;
- operação global bloqueada por padrão.

### Runtime governado

`kernel-planning → kernel-decision → kernel-policy → kernel-runtime → kernel-evidence → kernel-audit`

### Ciclo constitucional

`kernel-constitution → kernel-policy → kernel-audit → kernel-evolution → kernel-governance`

## 5. Evidência de validação

| Workflow | Run | Resultado |
|---|---:|---|
| Registry CI | `29669349266` | SUCESSO |
| Contracts CI | `29669349276` | SUCESSO |
| Platform CI | `29669349307` | SUCESSO |

Commit validado:

`64f53298b4828896156aeb44097190ae3b3c1169`

## 6. Pontos ainda pendentes

- consumo direto dos validadores compartilhados pelos quatro kernels cognitivos;
- teste cross-package da cadeia cognitiva completa;
- pacote executável de tenancy;
- pacote executável de auth;
- adoção uniforme de `@apidevelopers/contracts`;
- CI dedicado para todos os pacotes;
- proteção de `main` e política formal de promoção;
- observabilidade operacional consolidada.

## 7. Impacto na prontidão

A formalização dos handoffs, o contrato mínimo de tenancy e os três workflows verdes elevam a prontidão calculada de **77,05% para 79,65%**, arredondada operacionalmente para **80%**.

## 8. Governança

- **status:** MATRIZ_OFICIAL_ATUALIZADA
- **versão_origem:** GitHub no commit `64f53298b4828896156aeb44097190ae3b3c1169`
- **alvo:** API Developers.digital
- **risco:** R2
- **decisão_milena:** NÃO INFORMADA
- **execução_igor:** DOCUMENTAÇÃO TÉCNICA ATUALIZADA
- **deploy:** NÃO EXECUTADO
- **evidência_técnica:** contratos, testes e três CIs verdes
- **próximo_estado_permitido:** adoção dos contratos pelos kernels e teste cross-package
