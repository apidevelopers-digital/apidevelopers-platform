# Hostinger Agency API preflight — API-only

Esta etapa pertence à **Onda 13** e substitui qualquer necessidade de operação por navegador ou uni.desk.

## Objetivo

Validar, pela API oficial da Hostinger e em modo somente leitura:

- a autenticação do token;
- o acesso ao pedido Agency Hosting;
- os datacenters atualmente disponíveis;
- a prontidão para um futuro provisionamento isolado.

## Endpoints oficiais usados ou preparados

```text
GET  /api/agency-hosting/v1/orders/{order_id}/datacenters
POST /api/agency-hosting/v1/orders/{order_id}/websites/setups
GET  /api/agency-hosting/v1/orders/{order_id}/websites/setups/{setup_uuid}
```

O workflow desta etapa chama somente o primeiro endpoint com `GET`.

## GitHub Actions

Workflow:

```text
.github/workflows/site-factory-hostinger-agency-preflight.yml
```

Runner:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

Credenciais exigidas no GitHub, nunca no repositório ou no chat:

- secret `HOSTINGER_API_TOKEN`;
- secret `HOSTINGER_AGENCY_ORDER_ID`.

## Segurança

O relatório exige:

```text
mode: read-only
executable: false
writesEnabled: false
provisioningEnabled: false
dnsEnabled: false
deployEnabled: false
```

O preflight não cria website, não conecta repositório, não configura DNS e não executa deploy.

## Provisionamento futuro

O contrato futuro deverá permanecer separado e exigir nova aprovação explícita. Para um preview isolado, o payload previsto usa:

```text
flavor: php-fpm
type: node-static
domain: null
```

A omissão do domínio permite que a Hostinger gere um subdomínio temporário próprio. O datacenter deve ser selecionado apenas a partir da resposta atual do endpoint de datacenters.
