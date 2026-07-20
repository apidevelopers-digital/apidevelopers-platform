# @apidevelopers/subscription-core

Domínio canônico do ciclo de vida das assinaturas comerciais da API Developers.digital.

## Responsabilidades

- criar assinaturas pendentes a partir de um checkout externo;
- ativar somente após confirmação explícita;
- manter snapshots imutáveis e histórico append-only;
- deduplicar eventos externos por `sourceEventId`;
- controlar os estados `pending`, `active`, `past_due`, `suspended`, `cancelled` e `expired`;
- registrar período atual, âncora e intervalo de cobrança;
- agendar e aplicar mudanças de plano;
- renovar períodos sem sobreposição;
- cancelar imediatamente ou no fim do período;
- impedir mutações depois de cancelamento ou expiração;
- emitir eventos auditáveis para materialização de entitlements e automações operacionais.

## Fronteiras

- `plan-core` define produtos e planos vendáveis.
- `subscription-core` mantém o vínculo comercial contratado e seu ciclo de vida.
- `entitlement-core` materializa os direitos no tenant a partir dos eventos da assinatura.
- `billing-core` calculará faturas, pagamentos, créditos e débitos.
- `persistence-core` fornece os adaptadores duráveis.
- provedores de checkout e pagamento permanecem adaptadores externos.
- este pacote não guarda cartão, token de pagamento ou segredo de provedor.

## Eventos

- `subscription.created`
- `subscription.activated`
- `subscription.past_due`
- `subscription.suspended`
- `subscription.recovered`
- `subscription.plan_change_scheduled`
- `subscription.plan_changed`
- `subscription.renewed`
- `subscription.cancellation_scheduled`
- `subscription.cancelled`
- `subscription.expired`

## Validação

```bash
npm --prefix packages/subscription-core run check
```
