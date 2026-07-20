# @apidevelopers/plan-core

Domínio canônico de produtos e planos comerciais versionados da API Developers.digital.

## Responsabilidades

- representar produtos e planos como versões imutáveis e auditáveis;
- aplicar estados canônicos do catálogo comercial;
- armazenar preços em unidades mínimas da moeda;
- permitir `PRICE_TBD` sem expor valor comercial não aprovado;
- definir entitlements e meters por versão de plano;
- controlar vigência com janelas semiabertas;
- resolver a versão efetiva mais recente;
- declarar upgrades e downgrades permitidos;
- validar se produto e plano estão efetivamente vendáveis;
- oferecer contrato substituível de repositório e adaptador em memória.

## Fronteiras

- `plan-core` define o que é vendido;
- `limits-core` aplica franquias e decisões de consumo;
- `entitlement-core` materializará permissões contratadas no tenant;
- `billing-core` cobrará assinatura, excedentes e ajustes;
- `provisioning-core` criará recursos após ativação da assinatura;
- preços `PRICE_TBD` nunca podem ser publicados no site ou checkout.

## Estados

Produto:

`DRAFT → SPECIFIED → IMPORT_READY → STAGING_READY → READY_TO_SELL`

Plano:

`DRAFT → ACTIVE → LEGACY → RETIRED

## Validação

```bash
npm --prefix packages/plan-core run check
```
