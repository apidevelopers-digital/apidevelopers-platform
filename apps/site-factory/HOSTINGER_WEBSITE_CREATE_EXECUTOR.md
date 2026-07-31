
# Executor API-only de criação do website de preview

Esta etapa pertence à **Onda 13 — staging supervisionado e dry-run externo**.

O executor foi preparado exclusivamente para consumir o rascunho aprovado:

```text
draft fingerprint:
33d5b094f12cbb9a1b5513853d69755ba4f05dced90d8f13fc950ca869c5a1c6
```

## Escopo autorizado

A única escrita permitida na Hostinger é:

```text
POST /api/hosting/v1/websites
```

Payload fixado pelo rascunho:

```json
{
  "domain": "preview-apidevelopers.apidevelopers.digital",
  "order_id": "1009450581",
  "datacenter_code": "ascenty"
}
```

## Evidências imutáveis

O workflow lê diretamente pela GitHub REST API:

```text
draft ref:
b13fa5992344663b94c8f64dfea5ff448341ec55

draft path:
apps/site-factory/evidence/hostinger-website-create-draft-latest.json

approval ref:
1987a754c75ef495a395af356117779b6452ec71

approval path:
apps/site-factory/evidence/hostinger-website-create-approval.json
```

O recibo de aprovação é válido apenas para o mesmo fingerprint, domínio,
pedido mascarado e datacenter.

## Garantias

Antes do `POST`, o executor:

1. recalcula o fingerprint do rascunho;
2. recalcula o fingerprint do recibo de aprovação;
3. valida a derivação do token de aprovação;
4. verifica a validade temporal da aprovação;
5. confirma domínio, pedido e datacenter;
6. consulta o website pela Hostinger API;
7. evita o `POST` quando o domínio já existe;
8. bloqueia reexecuções quando já existe evidência de execução para o mesmo draft.

Após a execução, publica evidência sanitizada pela GitHub REST API em:

```text
branch:
evidence/hostinger-website-create-execution

path:
apps/site-factory/evidence/hostinger-website-create-execution-latest.json
```

## Idempotência

O fluxo realiza no máximo um `POST`.

Em reexecuções:

- se o domínio já existir, retorna `already_exists` sem novo `POST`;
- se a evidência de execução já existir, retorna `already_recorded`;
- se o `POST` tiver resposta ambígua mas o domínio aparecer no `GET`, registra
  `created_after_ambiguous_response`;
- não há retry automático do `POST`.

## Ações expressamente bloqueadas

O workflow não:

- conecta repositório;
- envia arquivo;
- inicia build Node.js;
- configura DNS;
- executa deploy;
- altera produção;
- altera ou remove WordPress;
- usa uni.desk, espelhamento, navegador supervisionado ou automação por clique.

## Workflow

```text
.github/workflows/site-factory-hostinger-website-create.yml
```

Runner institucional:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

O workflow é manual, usa concorrência exclusiva e exige `contents: write`
somente para registrar a evidência sanitizada no GitHub.
