# @apidevelopers/kernel-decision

Decisão consultiva, determinística e isolada por tenant sobre relatórios governados de planejamento.

## Invariantes

- exige `tenantId`, `cycleId` e `planningReport`;
- bloqueia mistura entre tenants e ciclos;
- evidências expiradas não satisfazem requisitos;
- revisões só contam quando `status: approved`;
- conflito constitucional permanece bloqueado;
- seleção é recomendação, nunca aprovação;
- `approved`, `mutationAllowed` e `executionAllowed` permanecem `false`;
- saída profundamente imutável;
- handoff governado `kernel-planning -> kernel-decision -> kernel-policy`.

Marcador: `KERNEL_DECISION_GATE_OK`.
