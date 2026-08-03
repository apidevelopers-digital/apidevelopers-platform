# Especificação de ativação controlada em dry-run — Operator Gateway

**Data:** 2026-08-02  
**Status:** proposta técnica; nenhuma ativação real autorizada  
**Base:** `apidevelopers-platform/main@d352581b4e5ff824a1e7f6e62e254b0fcadfeef9`

## Objetivo

Validar sem efeito externo o fluxo:

`referência opaca → cofre sintético → lease limitado → provider → cliente GitHub somente leitura → transporte stub → evidência sanitizada`

O dry-run não autoriza token real, chamada real à API GitHub, deploy, DNS, Hostinger ou alteração de produção.

## Backend do dry-run

Usar cliente de cofre sintético em memória, injetado por `githubVaultClient`.

Regras:

- nenhuma integração externa;
- token sintético `ghs_` com exatamente 520 bytes;
- allowlist exata da referência;
- lease entregue apenas durante o consumer;
- bytes temporários zerados ao final;
- nenhum segredo ou referência no descriptor, log ou artefato.

Referência permitida:

```text
vault://github/operator-readonly-installation-token-dry-run
```

Qualquer referência diferente deve falhar de forma fechada.

## Workflow

Arquivo previsto:

```text
.github/workflows/operator-gateway-controlled-activation-dry-run.yml
```

Runner obrigatório:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

Gatilho único: `workflow_dispatch`.

Bloqueios do workflow:

- sem `push`, `pull_request` ou cron;
- sem environment de produção;
- sem GitHub Actions secrets;
- sem conexão de rede;
- sem escrita no GitHub.

## Operação lógica validada

```text
GET /orgs/apidevelopers-digital
```

O transporte deve ser stub local. Métodos diferentes de `GET`, origem fora da allowlist e `Authorization` fornecido pelo chamador devem ser recusados.

## Evidência obrigatória

O JSON sanitizado deve registrar:

1. SHA e ID do workflow;
2. runner institucional;
3. `workflow_dispatch`;
4. operação lógica acima;
5. transporte local;
6. chamadas externas = 0;
7. token sintético = 520 bytes;
8. allowlist aceita e referência alternativa recusada;
9. método não-GET recusado;
10. lease consumido uma vez;
11. bytes temporários zerados;
12. descriptor sem token ou referência;
13. `productionChanged=false`;
14. `externalRequestExecuted=false`;
15. `realCredentialLoaded=false`.

Não registrar token, cookie, header de autorização, ambiente bruto ou stack trace sensível.

## Critérios para execução

Antes do disparo:

- PR aberto, não-draft e SHA congelado;
- API Gateway CI verde;
- Platform Baseline CI verde;
- revisão confirmando ausência de secrets e rede;
- workflow no `igor-mac-runner`;
- aprovação explícita do Igor.

Frase prevista:

```text
IGOR_APROVA_OPERATOR_GATEWAY_DRY_RUN
```

Essa aprovação autoriza somente o workflow sintético. Não autoriza merge, token real, chamada externa ou deploy.

## Rollback

Como não há efeito externo:

1. cancelar o workflow;
2. preservar apenas evidência sanitizada;
3. fechar o PR sem merge quando um critério falhar;
4. registrar a causa sem dados sensíveis.

## Bloqueios explícitos

Continuam bloqueados sem nova aprovação:

- token ou cofre real;
- `OPERATOR_GITHUB_TOKEN`;
- secret real no GitHub Actions;
- chamada real à API GitHub;
- escrita no GitHub;
- merge, deploy, DNS ou Hostinger.

## Próxima entrega

Criar PR de implementação contendo somente workflow manual, harness sintético, fixture mínima, verificador de evidência e testes de ausência de rede e segredo. A execução continuará bloqueada até aprovação explícita.
