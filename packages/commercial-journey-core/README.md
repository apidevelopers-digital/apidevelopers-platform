# @apidevelopers/commercial-journey-core

Orquestrador fail-closed para provar a jornada comercial completa da API Developers.digital sem ativar produção.

## Corte vertical

1. cadastro;
2. seleção de plano;
3. checkout em modo teste;
4. confirmação de pagamento simulada;
5. assinatura;
6. provisionamento de tenant e projeto;
7. emissão de API key;
8. primeira requisição.

## Segurança

- desabilitado por padrão;
- ativação somente por `enabled: true` injetado;
- nenhum provider, segredo, banco ou endpoint real;
- `liveAllowed: false`;
- `deployAllowed: false`;
- `externalPublicationAllowed: false`;
- falha interrompe imediatamente as etapas seguintes;
- resultados retornados com deep freeze;
- nenhuma mutação canônica.

## Uso

```js
import { createCommercialJourney } from "@apidevelopers/commercial-journey-core";

const journey = createCommercialJourney({
  enabled: true,
  adapters: {
    registerCustomer,
    selectPlan,
    createCheckoutSession,
    confirmPayment,
    activateSubscription,
    provisionWorkspace,
    issueApiKey,
    invokeFirstRequest,
  },
});

const result = await journey.execute({
  email: "owner@example.invalid",
  requestedPlan: "starter_test",
});
```

A flag `enabled` serve apenas para testes e composição explicitamente injetada. Ela não autoriza live, deploy ou publicação externa.
