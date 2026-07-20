# @apidevelopers/activation-core

Domínio canônico de ativação comercial da API Developers.digital.

## Responsabilidades

- consumir somente `checkout.session.completed` com `confirmed: true`;
- criar uma ativação idempotente por checkout;
- correlacionar checkout, conta, produto, plano e referência de pagamento;
- coordenar assinatura ativa e solicitação de provisionamento;
- controlar os estados `requested`, `running`, `completed`, `failed` e `cancelled`;
- manter snapshots imutáveis, revisões sequenciais e histórico append-only;
- deduplicar eventos externos por `sourceEventId`;
- gerar compensações reversas para recursos parciais;
- exigir compensação concluída antes de retry;
- emitir eventos canônicos para onboarding, portal e operação;
- bloquear segredos, tokens, API Keys, cartão e autorização em metadados.

## Fronteiras

- `checkout-core` confirma a conclusão comercial e o pagamento compatível.
- `activation-core` coordena a passagem segura da compra confirmada para assinatura e provisionamento.
- `subscription-core` cria e ativa a assinatura.
- `provisioning-core` cria tenant, projeto e API Key.
- Adaptadores externos executam os efeitos e devolvem eventos confirmados.
- `activation-core` não chama provedor de pagamento, não cria recursos diretamente e não armazena segredo.

## Eventos

- `activation.requested`
- `activation.started`
- `activation.subscription.completed`
- `activation.provisioning.requested`
- `activation.provisioning.completed`
- `activation.completed`
- `activation.failed`
- `activation.compensation.completed`
- `activation.compensation.failed`
- `activation.retry.requested`
- `activation.cancelled`

## Validação

```bash
npm --prefix packages/activation-core run check
```
