# @apidevelopers/kernel-planning

Planejamento institucional consultivo, determinístico e isolado por tenant.

## Invariantes

- exige `tenantId`, `cycleId` e relatório de reflexão governado;
- não decide, não aprova e não executa;
- `humanApprovalRequired: true`;
- `mutationAllowed: false`;
- `executionAllowed: false`;
- propostas críticas ou altas exigem análise de impacto completa;
- toda proposta mantém evidência e referências de origem;
- saídas são profundamente imutáveis;
- o handoff permitido é `kernel-reflection -> kernel-planning -> kernel-decision`.

## Validação

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

Marcador esperado:

```text
KERNEL_PLANNING_GATE_OK
```
