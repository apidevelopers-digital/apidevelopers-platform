# @apidevelopers/checkout-core

Domínio canônico das intenções e sessões de checkout da API Developers.digital.

## Responsabilidades

- criar intenções de compra idempotentes para uma conta já autenticada;
- congelar produto, versão, plano, preço e moeda durante a sessão;
- manter snapshots imutáveis e histórico append-only;
- controlar os estados `pending`, `completed`, `expired` e `cancelled`;
- deduplicar criação e webhooks externos;
- concluir somente após confirmação de provedor com sessão, valor e moeda compatíveis;
- emitir eventos canônicos para criação/ativação posterior da assinatura;
- expirar e cancelar sessões sem mutar o histórico;
- rejeitar cartão, token, segredo, CVV, senha ou autorização em metadados.

## Fronteiras

- `plan-core` define produtos, planos e preços vendáveis.
- `checkout-core` mantém a intenção e confirma a conclusão comercial.
- o adaptador externo cria a sessão hospedada e valida a assinatura do webhook.
- `subscription-core` cria e ativa a assinatura após consumir o evento confirmado.
- `billing-core` mantém faturas e pagamentos recorrentes.
- `provisioning-core` criará recursos somente após a assinatura ativa.
- este pacote não captura cartão, não guarda token de pagamento e não conhece segredo de provedor.

## Eventos

- `checkout.session.created`
- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.cancelled`

`checkout.session.completed` contém `confirmed: true` e os identificadores congelados de produto, plano, provedor, sessão e pagamento.

## Validação

```bash
npm --prefix packages/checkout-core run check
```
