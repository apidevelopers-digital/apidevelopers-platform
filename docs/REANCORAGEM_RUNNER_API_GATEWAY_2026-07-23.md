# REANCORAGEM CANÔNICA — RUNNER E API GATEWAY

**Data:** 2026-07-23  
**Repositório canônico:** `apidevelopers-digital/apidevelopers-platform`  
**Branch de validação:** `foundation/runner-smoke-20260723`

## 1. Estado validado

O runner self-hosted macOS foi validado por execução isolada e pelo workflow principal da API Gateway.

### Evidências

| Item | Workflow | Run | Commit | Resultado |
|---|---|---:|---|---|
| Smoke test do runner | `Runner Smoke CI` | `#5` | `927f3a630394083fc8f9a4401b0a5be47b4ffb1e` | `success` |
| CI principal da API Gateway | `API Gateway MVP CI` | `#59` | `c76be0f111b20e9a68681fe35bb22959fc29ac51` | `success` |

## 2. Caminhos reais validados

```text
.github/workflows/runner-smoke-ci.yml
.github/workflows/api-gateway-mvp-ci.yml
```

Runner esperado:

```text
self-hosted
macOS
X64
```

## 3. Causa raiz comprovada

A falha `ERR_MODULE_NOT_FOUND` não era causada pelo runner.

O pacote `@apidevelopers/apikey-core` depende de:

```text
@apidevelopers/persistence-core
```

O workflow criava links manuais para os demais pacotes internos, mas não para `persistence-core`.

A correção aplicada adicionou:

```text
persistence-core
```

à etapa `Link Gateway Core workspaces` em todos os jobs relevantes.

Commit original da correção:

```text
d7e96d2e952418dfa8a875308d89216146126b9a
ci(gateway): link persistence-core in all jobs
```

Commit validado no caminho coberto pelo gatilho:

```text
c76be0f111b20e9a68681fe35bb22959fc29ac51
ci(gateway): validate persistence-core bridge on foundation runner path
```

## 4. Linha de base operacional

A linha de base para validação de CI e runner passa a ser:

```text
branch: foundation/runner-smoke-20260723
workflow principal: .github/workflows/api-gateway-mvp-ci.yml
workflow diagnóstico: .github/workflows/runner-smoke-ci.yml
```

## 5. Fonte descartada como referência operacional

A branch:

```text
work/auth-durable-security-20260723
```

não deve ser usada como referência para disparo automático por `push` enquanto o filtro atual do workflow não incluir essa branch.

Ela foi útil para localizar e corrigir o defeito, mas não é a linha de base canônica de execução automática.

## 6. Hipóteses descartadas

Com base nas execuções concluídas com sucesso, ficam descartadas como causa desta falha:

- indisponibilidade do runner;
- incompatibilidade dos labels do runner;
- bloqueio geral do GitHub Actions;
- token de instalação do GitHub App;
- ausência do workflow no repositório.

## 7. Regra de continuidade

Antes de declarar um workflow validado:

1. confirmar a branch efetivamente coberta pelo gatilho;
2. confirmar o caminho exato do YAML;
3. confirmar o SHA executado;
4. confirmar `status: completed`;
5. confirmar `conclusion: success`;
6. só então atualizar a reancoragem canônica.

## 8. Próximo passo recomendado

Promover a correção validada para a linha principal por pull request, preservando esta evidência e evitando novo desvio entre branches.
