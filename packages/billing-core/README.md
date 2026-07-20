# @apidevelopers/billing-core

Domínio canônico de faturamento da API Developers.digital.

## Responsabilidades

- criar faturas determinísticas a partir do snapshot de assinatura e plano;
- calcular cobrança recorrente e excedente medido;
- aplicar créditos e ajustes em unidades monetárias mínimas;
- manter snapshots imutáveis, revisões sequenciais e histórico append-only;
- deduplicar checkout, webhooks e pagamentos por `sourceEventId`;
- finalizar faturas, registrar pagamentos parciais e totais;
- marcar vencimento, inadimplência, baixa e incobrável;
- emitir eventos para suspensão e recuperação em `subscription-core`.

## Fronteiras

- `plan-core` define produto, plano, moeda, preço base e referências de excedente.
- `usage-core` mede consumo; a integração entrega totais por medidor.
- `subscription-core` controla o ciclo contratual e reage aos eventos de cobrança.
- `billing-core` calcula e mantém faturas e pagamentos.
- o provedor de checkout/pagamento permanece adaptador externo.
- nenhum cartão, token de pagamento ou segredo é armazenado.

## Eventos

- `billing.invoice.created`
- `billing.invoice.finalized`
- `billing.payment.recorded`
- `billing.invoice.paid`
- `billing.invoice.past_due`
- `billing.invoice.voided`
- `billing.invoice.uncollectible`

## Validação

```bash
npm --prefix packages/billing-core run check
```
