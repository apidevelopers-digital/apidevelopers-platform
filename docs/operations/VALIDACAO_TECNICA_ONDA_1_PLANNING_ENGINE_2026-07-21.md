# Relatório à Torre de Comando — Validação Técnica da Onda 1

**Branch analisada:** `stabilization/wave-1-planning-engine-20260721`  
**HEAD analisado:** `0058b9733aec7c653a80273a48d9ff30b3225982`  
**Base registrada:** `main` em `e5aef84f36d00dfae694911f44be9f7f6edcaf79`  
**Fonte controlada:** `ea066ac5da9050c9b5010b23d88bef3df509ed8b`  
**Modo:** somente leitura durante a análise

## Status

A base está correta:

- merge-base com `main`: `e5aef84f36d00dfae694911f44be9f7f6edcaf79`;
- branch: 1 commit à frente e 0 atrás;
- delta atual: somente `docs/operations/STABILIZATION_WAVE_1_PLANNING_ENGINE.md`.

**Classificação atual:** bloqueada para aprovação técnica.

A branch está apta apenas para implementação mínima, pois ainda não contém o pacote canônico, os testes, o shim legado nem CI executável.

## Constatações técnicas

A branch atual contém:

- implementação legada completa em `scripts/lib/planning-engine.mjs`;
- documento da Onda 1.

Ainda não contém:

- `packages/kernel-planning`;
- manifesto raiz com workspaces;
- `.github/workflows`;
- testes de compatibilidade;
- integração com contratos;
- evidência de CI.

A fonte controlada define o pacote `@apidevelopers/kernel-planning@0.1.0`, com Node.js `>=22` e dependência externa `@apidevelopers/contracts@0.1.0`.

Essa dependência é relevante porque `src/governed.mjs` importa contratos de handoff e de relatório. A branch `main` não possui atualmente esse pacote nem estrutura de workspaces.

## Blobs canônicos a conferir

| Arquivo | Blob esperado |
|---|---|
| `packages/kernel-planning/package.json` | `2382d0aabbc1c1fbe9c8db4f4f7a25fb7e9018ea` |
| `packages/kernel-planning/src/index.mjs` | `12086f8f91fadd953807ec785008290bbbf5eb37` |
| `packages/kernel-planning/src/governed.mjs` | `4abc8bc9825b4b5108e0d69940794cec1c1d9a4f` |
| `packages/kernel-planning/test/index.test.mjs` | `025a518e14b8b396f25901862abd30cf6c265e3a` |
| `packages/kernel-planning/test/legacy-compatibility.test.mjs` | `080702b6039d5c7e4c332bb3cf1b6a72f4be1660` |
| `scripts/lib/planning-engine.mjs` — shim | `cdb306f6a59205d53b8cf94048914fe8f2b192e7` |
| `kernel-planning-ci.yml` da fonte | `c132fb62dc0b9face19334a7ee1c38372309cc3a` |

O shim legado esperado deve conter somente reexportação. Nenhuma classe, função ou lógica de planejamento deve permanecer duplicada nele.

## Workflows aplicáveis

### 1. Kernel Planning CI — obrigatório

Workflow de referência:

`.github/workflows/kernel-planning-ci.yml`

Deve executar:

- sintaxe do pacote;
- testes unitários;
- compatibilidade legada;
- smoke da API pública;
- integração Planning → Decision, quando a dependência estiver disponível.

Ressalva: o workflow da fonte referencia `tests/integration/kernel-planning-decision.test.mjs`. Esse arquivo não está na lista de escopo permitida e não existe na branch-alvo.

A Torre deve escolher uma destas opções:

1. autorizar esse teste de integração no escopo;
2. usar um workflow mínimo da Onda 1 sem essa etapa;
3. validar a integração em ambiente externo sem versionar o teste na branch.

O workflow mínimo deve usar:

```yaml
permissions:
  contents: read
```

Sem secrets, deploy, publicação, escrita no repositório ou chamadas produtivas.

### 2. Platform CI — condicional

O `Platform CI` da foundation é seguro quanto a permissões, mas não existe em `main` nem na branch analisada.

Não deve ser copiado integralmente apenas para esta onda, porque isso caracterizaria mudança genérica de CI, explicitamente fora de escopo.

### 3. Contracts CI — condicional e necessário para `governed.mjs`

Deve ser exigido se `src/governed.mjs` fizer parte da entrega.

Sem resolução comprovada de `@apidevelopers/contracts`, a validação do modo governado permanece incompleta.

### 4. Public Exposure Audit — recomendado

Executar somente um check de leitura para:

- segredos;
- credenciais;
- arquivos temporários;
- artefatos indevidos;
- exposição pública não autorizada.

Não portar toda a infraestrutura global de auditoria para a branch sem autorização.

## Comandos do pacote

Executar com Node.js 22:

```bash
node --version
```

Esperado:

```text
v22.x.x
```

Validação sintática:

```bash
node --check packages/kernel-planning/src/index.mjs
node --check packages/kernel-planning/src/governed.mjs
node --check packages/kernel-planning/test/index.test.mjs
node --check packages/kernel-planning/test/legacy-compatibility.test.mjs
```

Testes do pacote:

```bash
npm --prefix packages/kernel-planning test
```

Check completo declarado no manifesto:

```bash
npm --prefix packages/kernel-planning run check
```

Execução isolada:

```bash
node --test packages/kernel-planning/test/index.test.mjs
```

Smoke da API pública:

```bash
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import {
  PlanningEngine,
  createPlanningEngine,
  planningPriorities,
} from "./packages/kernel-planning/src/index.mjs";

const engine = createPlanningEngine({
  clock: () => "2026-07-21T00:00:00.000Z",
});

assert.ok(engine instanceof PlanningEngine);
assert.ok(Array.isArray(planningPriorities));
assert.ok(Object.isFrozen(planningPriorities));
NODE
```

Conteúdo publicável:

```bash
npm pack --dry-run --prefix packages/kernel-planning
```

## Compatibilidade do caminho legado

Teste canônico:

```bash
node --test packages/kernel-planning/test/legacy-compatibility.test.mjs
```

Conferência explícita:

```bash
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import * as official from "./packages/kernel-planning/src/index.mjs";
import * as legacy from "./scripts/lib/planning-engine.mjs";

assert.deepEqual(Object.keys(legacy).sort(), Object.keys(official).sort());
assert.strictEqual(legacy.PlanningEngine, official.PlanningEngine);
assert.strictEqual(legacy.createPlanningEngine, official.createPlanningEngine);
assert.strictEqual(legacy.planningPriorities, official.planningPriorities);
NODE
```

Conferência do shim:

```bash
git hash-object scripts/lib/planning-engine.mjs
```

Esperado:

```text
cdb306f6a59205d53b8cf94048914fe8f2b192e7
```

Qualquer lógica de negócio no shim legado é regressão arquitetural.

## Validação do modo governado

Importação mínima:

```bash
node --input-type=module -e   "await import('./packages/kernel-planning/src/governed.mjs')"
```

Esse comando deve concluir sem:

- `ERR_MODULE_NOT_FOUND`;
- falha de resolução de `@apidevelopers/contracts`;
- erro de exports;
- dependência circular.

Integração recomendada:

```bash
node --test tests/integration/kernel-planning-decision.test.mjs
```

Essa etapa permanece condicionada à autorização do arquivo de integração ou à existência dele na base aprovada.

Rota obrigatória:

```text
kernel-reflection
→ kernel-planning
→ kernel-decision
```

Devem ser preservados:

- `tenantId`;
- `cycleId`;
- `sourceHandoffId`;
- contrato do relatório;
- validação do handoff.

## Checks globais seguros

Base e histórico:

```bash
git rev-parse HEAD
git merge-base HEAD main
git log --oneline e5aef84f36d00dfae694911f44be9f7f6edcaf79..HEAD
```

Escopo:

```bash
git diff --name-only   e5aef84f36d00dfae694911f44be9f7f6edcaf79...HEAD
```

Integridade:

```bash
git diff --check   e5aef84f36d00dfae694911f44be9f7f6edcaf79...HEAD
```

Árvore limpa:

```bash
git status --short
```

Esperado: nenhuma saída.

Workspaces, somente se houver manifesto raiz válido:

```bash
npm test --workspaces --if-present
```

Resolução da dependência:

```bash
npm --prefix packages/kernel-planning ls @apidevelopers/contracts
```

Qualquer dependência ausente, extraneous ou resolvida fora da versão permitida bloqueia a aprovação.

## Evidências obrigatórias para aprovação

| Evidência | Exigência |
|---|---|
| HEAD inicial e final | SHAs completos |
| Merge-base | deve ser `e5aef84f36d00dfae694911f44be9f7f6edcaf79` |
| Arquivos alterados | somente allowlist autorizada |
| Blobs canônicos | hashes ou justificativa de divergência |
| Node.js | versão 22 |
| Testes do pacote | comando, saída e exit code 0 |
| Compatibilidade legada | exportações e identidade aprovadas |
| Modo governado | import e contratos aprovados |
| Determinismo | mesma entrada produz saída idêntica |
| Imutabilidade | entrada permanece inalterada |
| Gates | aprovação humana e bloqueios preservados |
| CI | workflow, run ID, SHA e resultado |
| Segurança | auditoria sem segredos |
| Estado Git | árvore limpa |
| Histórico | no máximo três microcommits coerentes |

## Sinais de regressão

Bloquear ao detectar qualquer um destes sinais:

- exportações diferentes entre API canônica e caminho legado;
- `PlanningEngine`, factory ou prioridades com identidades diferentes;
- lógica duplicada no shim legado;
- saída não determinística para entrada e relógio fixos;
- mutação do relatório de reflexão recebido;
- mudança da ordenação por prioridade;
- desaparecimento do estado `needs-evidence`;
- conflito constitucional deixando de produzir estado `blocked`;
- `humanApprovalRequired` diferente de `true`;
- mutação ou execução habilitada;
- quebra de `tenantId`, `cycleId` ou handoff;
- import de `governed.mjs` sem contratos resolvidos;
- API pública ampliada ou reduzida sem decisão;
- Node.js anterior à versão 22;
- falha em teste global causada pela onda;
- arquivo de outro domínio no diff;
- mais de 12 arquivos alterados;
- segredo ou configuração sensível;
- commits concorrentes na branch.

## Condição objetiva de bloqueio

A Onda 1 deve ser marcada como **BLOQUEADA** quando qualquer item abaixo for verdadeiro:

```text
merge-base != e5aef84f36d00dfae694911f44be9f7f6edcaf79
OU pacote canônico ausente
OU shim legado não for reexport puro
OU @apidevelopers/contracts não resolver
OU teste do pacote falhar
OU compatibilidade legada falhar
OU modo governado não puder ser importado
OU integração Planning → Decision não tiver evidência
OU diff contiver arquivo não autorizado
OU total de arquivos alterados > 12
OU existir segredo/configuração sensível
OU CI não estiver vinculado ao HEAD final
OU houver commits concorrentes
```

## Bloqueios presentes na análise

1. `packages/kernel-planning` ainda não existe na branch;
2. o caminho legado ainda contém a implementação completa;
3. não existe teste de compatibilidade na branch;
4. não existe workflow executável na branch ou em `main`;
5. `@apidevelopers/contracts` não está disponível na linha atual;
6. não há evidência de testes no HEAD `0058b9733aec7c653a80273a48d9ff30b3225982`.

## Recomendação à Torre de Comando

**Resultado:** bloqueado para aprovação técnica.

Pode prosseguir apenas para implementação mínima controlada, com estas decisões prévias:

1. definir como `@apidevelopers/contracts` será disponibilizado sem transportar outro domínio;
2. decidir se o teste `kernel-planning-decision` entra no escopo;
3. aprovar workflow mínimo isolado ou outro mecanismo de CI;
4. preservar a base `main` registrada;
5. manter o delta dentro da allowlist e do limite de 12 arquivos.

Nenhum merge ou deploy deve ser autorizado antes de todos os gates acima estarem verdes no mesmo HEAD.
