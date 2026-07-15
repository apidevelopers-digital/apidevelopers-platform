# @API Developers/events

Serviço canônico de eventos da API Developers.digital.

## Responsabilidades

- receber e normalizar eventos de serviços, engines e canais;
- aplicar um envelope canônico e versionado;
- preservar tenant, request, correlation e causation ids;
- suportar idempotência, retensão e reprocessamento;
- entregar eventos a consumidores autorizados.

## Envelope canônico

Campos mínimos:

- `event_id`
- event_type`
- `event_version`
- `tenant_id`
- `request_id`
- `correlation_id`
- `causation_id`
- `occurred_at`
- `producer`
- cubject`
- `data`
- `metadata`

## Regras

1. Eventos públicos são versionados.
2. `event_id` é único e idempotente.
3. `tenant_id` é obrigatório, exceto em eventos públicos explícitos.
4. `request_id` e `correlation_id` são propagados entre serviços.
5. `causation_id` aponta para o evento que originou o novo evento.
6. Eventos não carregam segredos, tokens ou dados desnecessários.
7. Consumidores devem tolerar reentrega.
8. Politicas de retenção variam por classificação de risco.

## Eventos iniciais

- `identity.authenticated.v1`
- `tenant.context.validated.v1`
- `memory.proposed.v1`
- `memory.approved.v1`
- `workflow.started.v1`
- `workflow.completed.v1`
- `channel.message.received.v1`
- `channel.message.sent.v1`
- `audit.recorded.v1`

## Critérios de conclusão

- envelope validado por schema;
- idempotência testada;
- correlação e causalidade preservadas;
- isolamento por tenant verificado;
- testes de reentrega e falha suportados.

## Status

Foundation v1 em implementação.
