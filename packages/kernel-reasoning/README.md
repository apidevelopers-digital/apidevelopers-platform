# @apidevelopers/kernel-reasoning

Motor determinístico, somente leitura e isolado por tenant para produzir conclusões explicáveis a partir de snapshots governados de memória e Knowledge Graph.

## Invariantes

- exige `tenantId` e `cycleId`;
- bloqueia memória de outro tenant;
- não altera memória nem Knowledge Graph;
- não decide, aprova ou executa ações;
- usa regras determinísticas identificadas por `ruleId`;
- retorna relatório profundamente congelado;
- usa um único instante para `reasoningId` e `generatedAt`;
- o handoff governado aceita somente `kernel-memory -> kernel-reasoning`;
- o próximo estágio é `kernel-reflection`.

## Validação

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

Marcador esperado:

```text
KERNEL_REASONING_GATE_OK
```
