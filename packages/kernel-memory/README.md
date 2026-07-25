# @apidevelopers/kernel-memory

Memória institucional append-only, isolada por tenant e verificável por encadeamento SHA-256.

## Papel

O pacote registra problemas, planos, decisões, execuções, resultados, evidências e lições aprendidas. Ele não decide, não aprova, não executa ações e não modifica o Knowledge Graph.

## Invariantes

- cada instância é vinculada a um `tenantId`;
- leitura e escrita entre tenants são bloqueadas;
- IDs não podem ser reutilizados;
- registros anteriores não são sobrescritos;
- cada entrada recebe sequência, `previousDigest` e `digest`;
- snapshots são somente leitura e validáveis por integridade;
- objetos retornados são clonados e congelados;
- o handoff para raciocínio exige contexto de tenant compatível;
- não existe caminho de execução automática.

## Contrato público

```js
import {
  createInstitutionalMemory,
  createMemoryReasoningHandoff,
  verifyMemorySnapshotIntegrity,
} from "@apidevelopers/kernel-memory";
```

Métodos principais:

```js
memory.append(entry)
memory.get(id)
memory.list(filters)
memory.cycle(cycleId)
memory.lessons(filters)
memory.snapshot()
memory.verifyIntegrity()
```

## Persistência

Esta versão implementa o núcleo determinístico em memória. Persistência durável, retenção, criptografia e recuperação devem ser integradas por adaptador governado em uma frente posterior; não são presumidas por este pacote.

## Segurança

Uma entrada pode conter referências e evidências, mas o pacote não autoriza mutação externa, decisão ou execução real. Dados sensíveis continuam sujeitos às políticas institucionais de minimização, redação e acesso.

## Testes

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

Marcador funcional esperado:

```text
KERNEL_MEMORY_GATE_OK
```
