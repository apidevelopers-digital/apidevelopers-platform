# @apidevelopers/kernel-planning

Planejamento institucional determinístico, consultivo e isolado por tenant.

## Invariantes

- exige `tenantId`, `cycleId` e `reflectionReport`;
- aceita somente relatório de reflexão em modo `advisory`;
- não altera a reflexão de entrada;
- agrupa achados por assunto e categoria;
- produz prioridades, alternativas, recomendação, evidências e revisões;
- conflitos constitucionais permanecem `blocked`;
- propostas de risco alto ou crítico exigem análise de impacto;
- toda proposta exige aprovação humana;
- mutação, aprovação automática e execução automática permanecem bloqueadas;
- o relatório é profundamente imutável;
- o handoff governado aceita apenas `kernel-reflection -> kernel-planning`;
- o próximo estágio é `kernel-decision`.

## Validação

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

Marcador funcional esperado:

```text
KERNEL_PLANNING_GATE_OK
```
