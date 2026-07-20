# @apidevelopers/entitlement-core

Domínio canônico de direitos contratados e snapshots auditáveis da API Developers.digital.

## Responsabilidades

- materializar no tenant os direitos de um produto e plano vendáveis;
- copiar APIs, entitlements e meters aprovados pelo `plan-core`;
- manter histórico append-only por assinatura;
- impedir reescrita ou salto de revisões;
- deduplicar eventos externos por `sourceEventId`;
- suspender e reativar direitos;
- aplicar troca de plano como uma nova revisão;
- revogar direitos no cancelamento ou expiração;
- avaliar acesso por API e capability;
- suportar vigência com intervalos semiabertos.

## Fronteiras

- `plan-core` define o catálogo comercial e os direitos declarados.
- `entitlement-core` materializa o snapshot contratado no tenant.
- `limits-core` aplica franquias e decisões de consumo.
- `billing-core` controlará assinatura, pagamentos e inadimplência.
- `tenant-core` continua dono do ciclo de vida do tenant.
- `project-core` continua dono dos projetos.
- Persistência durável será fornecida por adaptadores externos.

## Eventos

- `entitlement.materialized`
- `entitlement.plan_changed`
- `entitlement.suspended`
- `entitlement.reactivated`
- `entitlement.cancelled`
- `entitlement.expired`

## Validação

```bash
npm --prefix packages/entitlement-core run check
```
