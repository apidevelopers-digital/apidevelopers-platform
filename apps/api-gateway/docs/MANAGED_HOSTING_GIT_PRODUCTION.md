# API Gateway — Managed Hosting Git Production

**Status:** vigente  
**Data de referência:** 2026-08-16  
**Escopo:** caminho produtivo do API Gateway em Hostinger.

## Caminho canônico

```text
apidevelopers-platform/main
        |
        | explicitamente aprovado
        v
API Gateway Runtime Publish
        |
        v
deploy/hostinger-gateway-runtime
        |
        | integração Git da Hostinger
        v
Hostinger Node.js Web App
        |
        +-- parked domain --> gateway.apidevelopers.digital
```

A Hostinger deve consumir a branch:

`deploy/hostinger-gateway-runtime`

O domínio produtivo:

`gateway.apidevelopers.digital`

deve permanecer associado ao Node.js Web App principal como `parked_domain`.

O hostname Hostinger do Web App principal é operacional e não deve ser removido enquanto o domínio produtivo estiver associado a ele.

## Workflows

### `api-gateway-runtime-publish.yml`

Publica a branch de runtime a partir de um SHA exato de `main`.

É uma mutação sensível porque escreve na branch:

`deploy/hostinger-gateway-runtime`

Requer aprovação explícita conforme a governança vigente.

### `api-gateway-managed-hosting-production.yml`

É **preflight-only**.

Valida:

- SHA exato de `main`;
- SHA exato da branch de runtime;
- `SOURCE_SHA`;
- artefato gerenciado;
- arquivos mínimos do runtime;
- readiness pública em `https://gateway.apidevelopers.digital/ready`;
- persistência crítica `ok/readable`.

Esse workflow **não**:

- envia ZIP para Hostinger;
- chama Node build `from-archive`;
- altera DNS;
- altera domínio;
- ativa Trust;
- faz deploy de produção.

O deploy efetivo ocorre pela integração Git da Hostinger quando a branch de runtime é atualizada.

### `api-gateway-trust-one-time-production.yml`

Mantido apenas como status fail-closed.

Não contém caminho de ativação de Trust nem mutação Hostinger.

Qualquer ativação futura de Trust exige implementação revisada e aprovação explícita própria imediatamente antes da execução.

## Caminho não canônico

O endpoint Hostinger Node build `from-archive` e workflows que tentem upload multipart **não são o caminho produtivo vigente** do Gateway.

Não reativar esse fluxo como fallback automático.

## Readiness produtiva

O endpoint operacional é:

`https://gateway.apidevelopers.digital/ready`

O estado saudável esperado inclui:

- `service: api-gateway`;
- `status: ready`;
- check crítico `persistence`;
- `persistence.status: ok`;
- `persistence.code: readable`.

## Domínio e estabilidade

Para associar novamente o domínio produtivo, caso seja necessário no futuro:

1. confirmar que `gateway.apidevelopers.digital` não existe como website separado;
2. confirmar a ausência em leituras sucessivas;
3. somente então criar o `parked_domain` no Web App Node/Git;
4. confirmar que o domínio permanece como `parked_domain`;
5. confirmar que não reapareceu como website separado;
6. validar `/ready`.

Não remover o Web App Node/Git principal enquanto o domínio produtivo estiver associado a ele.

## Trust

Trust permanece desligado neste caminho.

Nenhuma configuração de deploy do Gateway implica ativação de Trust.

Qualquer alteração de Trust é uma ação separada, com revisão e aprovação próprias.
