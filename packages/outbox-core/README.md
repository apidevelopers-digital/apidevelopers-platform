# @apidevelopers/outbox-core

Publicador transacional da outbox da API Developers.digital.

## Fluxo

```text
persistência transacional
  → claim com lease
  → publicação no transporte injetado
  → confirmação transacional
  → retry agendado
  → dead-letter após o limite
```

## Garantias

- claim exclusivo por worker;
- recuperação de lease expirado;
- publicação somente de entradas elegíveis;
- confirmação e falha registradas em transação;
- retry com atraso configurável;
- dead-letter determinística;
- nenhuma credencial, URL de broker ou segredo no domínio;
- transporte externo injetado pelo runtime;
- relatório imutável por execução;
- entrega at-least-once, com deduplicação externa obrigatória por `event.id`.

## Contrato do transporte

```js
transport.publish({
  id,
  type,
  aggregateId,
  payload,
  headers,
  occurredAt,
});
```

## Validação

```bash
npm --prefix packages/outbox-core run check
```
