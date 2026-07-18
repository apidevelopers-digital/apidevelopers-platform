# REANCORAGEM CANÔNICA — API Developers.digital

**Data da conferência:** 2026-07-18  
**Status:** PREPARADO_PARA_CONTINUIDADE  
**Fonte:** GitHub conectado — `sitedauni/apidevelopers-platform`  
**Modo:** somente leitura e consolidação documental  
**Merge:** NÃO EXECUTADO  
**Deploy:** NÃO EXECUTADO  
**Workflow manual:** NÃO EXECUTADO  

## 1. Identidade e nomenclatura

- Plataforma: **API Developers.digital**
- Organização/Wordmark institucional: `uni.`
- Nome operacional: `uni. Operador`
- CLI oficial: `apid`
- Namespace de pacotes: `@apidevelopers/*`
- `uni.` não deve nomear o CLI, o Kernel ou o Engineering Toolkit.

## 2. Repositório confirmado

- Repositório privado: `sitedauni/apidevelopers-platform`
- Branch padrão do repositório: `main`
- Head de `main`: `e5aef84f36d00dfae694911f44be9f7f6edcaf79`
- Branch principal de desenvolvimento: `foundation/global-platform-bootstrap-20260715`
- Head atual da foundation: `66232cc6d409aff4c156f68af0a6f6f54df62d9d`
- Última atualização confirmada da foundation: **18/07/2026**

Branches relevantes observadas:

| Branch | Head | Papel |
|---|---|---|
| `foundation/global-platform-bootstrap-20260715` | `66232cc...` | linha principal de construção |
| `audit/institutional-recovery` | `98b0b0c...` | auditoria institucional incremental |
| `ops/wave5-atomic-publisher-20260716` | `e018c5d...` | onda operacional de publicação atômica |
| `main` | `e5aef84...` | branch padrão, ainda não consolidada com a foundation |

Não há pull requests abertos no momento da conferência.

## 3. Documento de continuidade localizado

Foi localizado o documento:

`docs/inventory/REPOSITORY_AND_ASSET_AUDIT_2026-07-17.md`

Commit de criação:

`ae1142b7bf8b7b576443326b22590bdd2d18d902`

Título:

**Auditoria consolidada de repositórios e ativos — 2026-07-17**

O documento estabelece:

- `apidevelopers-platform` como centro da fundação técnica;
- `unico-api-platform` como legado controlado e fonte de migração;
- risco principal de fragmentação entre repositórios, branches, workflows, bridges e MVPs;
- prioridade para Registry, contratos, Factory, políticas, observabilidade e promoção formal de ativos;
- backlog imediato de estabilização, Asset Registry e redução progressiva do legado;
- proibição de merge, deploy, publicação e ações reais por força do documento.

## 4. Correção da âncora anterior

A reancoragem de 16/07/2026 indicava a **Onda 2** como próxima ação, com:

- criação de `kernel-planning`;
- criação de `kernel-decision`.

Esse estado ficou obsoleto.

O GitHub confirma que ambos já foram implementados:

- `@apidevelopers/kernel-planning`
- `@apidevelopers/kernel-decision`

Também estão presentes na branch foundation:

- `kernel-memory`
- `kernel-reasoning`
- `kernel-reflection`
- `kernel-audit`
- `kernel-evolution`
- `kernel-governance`
- `kernel-constitution`
- `kernel-evidence`
- `kernel-policy`
- `kernel-runtime`

Além de:

- `auth`
- `contracts`
- `registry`
- `tenancy`

## 5. Última alteração funcional confirmada

Após o inventário consolidado, foram feitos dois commits na foundation:

1. `ac0ea103aba68bfcb33287608ac26a6c3dda3d6c`  
   `fix(kernel-decision): prioritize severity before readiness`

2. `66232cc6d409aff4c156f68af0a6f6f54df62d9d`  
   `test(kernel-decision): cover critical review prioritization`

Mudança funcional:

- a seleção do `kernel-decision` agora prioriza a criticidade antes do estado de prontidão;
- uma proposta crítica que ainda precisa de revisão permanece acima de uma proposta média já pronta;
- foi adicionado teste específico para esse comportamento.

## 6. Estado dos workflows

Foram encontrados 10 workflows ativos:

- Platform CI
- Kernel Constitution CI
- Contracts CI
- Kernel Decision CI
- Kernel Planning CI
- Registry CI
- Wave 3 atomic publisher
- Wave 4 atomic publisher
- Wave 5 atomic publisher
- Wave 5 atomic publish trigger

O inventário de 17/07 registrava:

- Platform CI com execução recente bem-sucedida;
- Registry CI com falha de configuração.

Depois disso, houve commits de correção no workflow do Registry. Entretanto, a consulta consolidada dos runs atuais excedeu o limite de resposta do conector. Portanto:

- existência e ativação dos workflows: **CONFIRMADAS**;
- status final mais recente de cada run: **NÃO CONFIRMADO NESTA CONFERÊNCIA**.

## 7. Auditoria incremental separada

A branch `audit/institutional-recovery` contém:

`scripts/institutional-audit/audit.mjs`

Esse script gera:

- `.audit/snapshot.json`
- `.audit/report.md`

A finalidade é comparar hashes de arquivos entre execuções e manter continuidade incremental sem reiniciar a auditoria do zero.

Esse script **não está presente** na branch foundation no estado conferido. Portanto, a auditoria incremental ainda deve ser tratada como trabalho separado, não consolidado.

## 8. Estado arquitetural atual

A linha arquitetural permanece:

```text
Context Builder
    ↓
Knowledge Graph
    ↓
Ontology
    ↓
Reasoning
    ↓
Planning
    ↓
Deliberation
    ↓
Decision
    ↓
Audit
    ↓
Evolution
    ↓
Execution Gateway
```

Princípios preservados:

- decisão não executa;
- planejamento não decide;
- reasoning não altera estado;
- execução deve passar por gateway governado;
- dry-run primeiro;
- evidência obrigatória;
- multi-tenant deny-by-default;
- nenhum ativo é oficial sem contrato, testes, políticas, observabilidade e evidência de promoção.

## 9. Riscos atuais

### Risco principal — fragmentação

- foundation avançada sem PR aberto;
- `main` permanece em commit antigo;
- auditoria incremental está em branch separada;
- workflows de ondas permanecem ativos;
- ativos legados continuam fora da fonte oficial;
- não há proteção de branch confirmada.

### Risco técnico — consolidação prematura

A existência dos pacotes não prova, isoladamente:

- integração completa entre todos os módulos;
- cobertura integral dos contratos;
- CI verde em todos os workflows;
- prontidão para release;
- promoção para `main`.

## 10. Próximo plano permitido

### Etapa 1 — conferência da foundation

1. Ler `package.json` raiz e scripts oficiais.
2. Conferir manifests dos pacotes `kernel-*`.
3. Validar dependências entre Planning, Decision, Policy, Evidence, Audit e Runtime.
4. Conferir os workflows dedicados.
5. Rodar validação e testes em ambiente controlado, sem publicação.

### Etapa 2 — estabilização

1. Confirmar Registry CI.
2. Confirmar Platform CI.
3. Corrigir inconsistências documentais.
4. Atualizar auditoria consolidada com o head `66232cc...`.
5. Definir se o script de auditoria incremental deve ser incorporado à foundation.

### Etapa 3 — preparação de promoção

1. Preparar comparação foundation versus `main`.
2. Registrar riscos e arquivos afetados.
3. Abrir pull request em modo draft.
4. Não fazer merge.
5. Não gerar release.
6. Não executar deploy.

## 11. Próxima ação exata

A próxima ação técnica correta é:

> Auditar a integração dos pacotes já existentes na branch `foundation/global-platform-bootstrap-20260715`, começando por `kernel-decision`, `kernel-planning`, `kernel-policy`, `kernel-evidence` e `kernel-runtime`, e gerar um relatório de prontidão da foundation antes de qualquer PR ou promoção para `main`.

## 12. Prompt de continuidade

> Continue o desenvolvimento do repositório `sitedauni/apidevelopers-platform` na branch `foundation/global-platform-bootstrap-20260715`, atualmente no commit `66232cc6d409aff4c156f68af0a6f6f54df62d9d`. A Onda 2 já foi concluída: `kernel-planning` e `kernel-decision` existem. O último ajuste fez o `kernel-decision` priorizar criticidade antes da prontidão e adicionou teste para propostas críticas pendentes de revisão. Use `apid` como CLI. Não use `uni` como nome do CLI. Antes de criar novos pacotes, audite a integração entre Planning, Decision, Policy, Evidence, Audit e Runtime, confirme os workflows e gere relatório de prontidão. Não faça merge, release ou deploy.

## 13. Relatório obrigatório

- **status:** PREPARADO_PARA_CONTINUIDADE
- **versão_origem:** GitHub até `66232cc6d409aff4c156f68af0a6f6f54df62d9d`
- **alvo:** continuidade da API Developers.digital
- **risco:** R2, com elevação automática conforme conteúdo
- **decisão_milena:** NÃO INFORMADA NESTA CONFERÊNCIA
- **execução_igor:** NÃO EXECUTADA
- **deploy:** NÃO EXECUTADO
- **evidência_técnica:** repositório, branches, commits, arquivos, pacotes, workflows e ausência de PR aberto conferidos via GitHub
- **próximo_estado_permitido:** auditoria de integração e relatório de prontidão da branch foundation
