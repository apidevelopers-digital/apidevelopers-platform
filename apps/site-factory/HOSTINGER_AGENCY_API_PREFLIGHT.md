# Hostinger Business Web Hosting API preflight — API-only

Esta etapa pertence à **Onda 13** e usa apenas GitHub Actions e a API oficial da Hostinger. Não utiliza navegador operacional nem uni.desk.

## Correção de compatibilidade

Os runs `30593724760` e `30593738181` falharam porque o pedido `1009450581` é do produto **Business Web Hosting**, enquanto o workflow utilizava a família de endpoints `Agency Hosting`.

O contrato correto para o pedido vigente é:

```text
GET /api/hosting/v1/datacenters?order_id={order_id}
```

A resposta oficial contém:

```text
title
code
coordinates
```

## Objetivo

Validar em modo somente leitura:

- a autenticação do token;
- o acesso ao pedido de Business Web Hosting;
- os datacenters atualmente disponíveis;
- a prontidão para preparar uma futura criação isolada.

## Endpoints oficiais relacionados

Usado pelo workflow atual:

```text
GET  /api/hosting/v1/datacenters?order_id={order_id}
```

Preparados apenas como referência para etapas futuras e separadas:

```text
POST /api/hosting/v1/websites
POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive
```

O workflow desta etapa chama somente o endpoint `GET`.

## GitHub Actions

Workflow:

```text
.github/workflows/site-factory-hostinger-agency-preflight.yml
```

O nome físico do arquivo foi preservado para evitar exclusão e manter a rastreabilidade do PR #99. O nome exibido no GitHub Actions passa a ser `Site Factory Hostinger Business Preflight`.

Runner:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

Secrets usados:

- `HOSTINGER_API_TOKEN`;
- `HOSTINGER_AGENCY_ORDER_ID`.

O segundo nome é legado. O valor é utilizado como `HOSTINGER_HOSTING_ORDER_ID` dentro do workflow, sem exigir que o usuário revele ou cadastre novamente o ID do pedido.

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

O preflight não cria website, não conecta repositório, não configura DNS, não envia arquivo, não inicia build e não executa deploy.

Qualquer chamada `POST` permanece bloqueada e exige aprovação explícita separada.
