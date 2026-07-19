# @apidevelopers/registry-core

Núcleo determinístico de registros da API Developers.digital.

## Contrato

- registra entidades por chave estável;
- rejeita duplicidade por padrão;
- retorna leituras clonadas e snapshots;
- filtra por visibilidade, status, tag ou predicado;
- não persiste dados nem executa decisões de negócio.

```js
import { createRegistry } from "@apidevelopers/registry-core";

const registry = createRegistry({
  entries: [{ id: "platform-health", visibility: "public" }],
});

registry.list({ visibility: "public" });
```
