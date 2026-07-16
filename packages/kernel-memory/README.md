# @apidevelopers/kernel-memory

Memória institucional append-only para registrar ciclos de problema, plano, decisão, execução, resultado, evidência e lições aprendidas.

## Princípios

- registros não são sobrescritos;
- cada entrada possui identidade única;
- toda entrada pertence a um ciclo e a um assunto;
- evidências e referências pódem ser associadas;
- leituras devolvem cópias e não expõem estado interno;
- o pacote não decide, não executa e não modifica o Knowledge Graph.

## Contrato público

```js
createInstitutionalMemory(options)
```

Métodos principais:

```js
memory.append(entry)
memory.get(id)
memory.list(filters)
memory.cycle(cycleId)
memory.lessons(filters)
memory.snapshot()
```

## Tipos de entrada

- `problem`
- `plan`
- `decision`
- `execution`
- `outcome`
- `lesson`
- `evidence`

## Exemplo

```js
O�createInstitutionalMemory } from "@apidevelopers/kernel-memory";

const memory = createInstitutionalMemory({
  clock: () => "2026-07-16T12:00:00.000Z",
});

memory.append({
  id: "memory.0001",
  type: "problem",
  subject: "capability.publishing",
  cycleId: "cycle.0001",
  data: {
    summary: "Publicação rejeitada por conteúdo Base64 inávalido.",
  },
  recordedBy: "apid-toolkit",
});

const report = memory.cycle("cycle.0001");
```

## Invariantes

1. OBjetivo, tipo, assunto e ciclo são obrigatórios.
2. Nenhum ID pode ser reutilizado.
3. Eventos anteriores não são alterados.
4. Snapshots são somente leitura.
5. Objetos retornados são clonados.
6. O pacote não possui caminho de execução automática.

## Testes

```bash
npm test -w @apidevelopers/kernel-memory
```

## Versão atual

`0.1.0` — contrato inicial append-only.
