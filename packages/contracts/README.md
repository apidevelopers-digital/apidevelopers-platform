# @apidevelopers/contracts

Pacote canônico de contratos compartilhados da API Developers.digital.

## Responsabilidades

- definir contratos versionados;
- padronizar eventos, identidade, tenant e contexto;
- eliminar contratos duplicados entre produtos;
- preservar compatibilidade entre serviços e consumidores;
- fornecer adapters explícitos entre artefatos governados.

## Regras permanentes

1. Contratos técnicos usam nomes neutros.
2. Contratos públicos são versionados.
3. Mudanças incompatíveis exigem nova versão major.
4. Produtos `uni.`, `uni.co`, `imuni.` e `uni.juri` consomem os contratos; não os possuem.
5. Cada contrato deve possuir testes de validação.
6. Adapters não podem inventar dados executáveis nem criar aliases silenciosos.

## Contratos iniciais

- `TenantContext`
- `RequestContext`
- `EventEnvelope`
- `AuditRecord`
- `IdentityRef`
- `ConnectionRef`
- `AttachmentRef`
- `MemoryRecord`

## Adapter Planning → ExecutionPlan

O adapter recebe:

- `PlanningReport`;
- `Decision`;
- `tenantId`;
- função obrigatória `buildSteps`.

Ele valida o vínculo `Decision.sourcePlanningId === PlanningReport.planningId`, seleciona a proposta decidida e produz um `ExecutionPlan` distinto:

- `planId`: identidade própria do plano executável;
- `sourcePlanningId`: rastreabilidade para o relatório de Planning;
- `decisionId` e `proposalId`;
- `steps` construídos apenas pelo callback explícito;
- `status: draft`;
- mutação, aprovação e execução automáticas proibidas.

`planningId` nunca é reutilizado como `planId`.

## Uso

```js
import {
  adaptPlanningDecisionToExecutionPlan,
} from "@apidevelopers/contracts";

const executionPlan = adaptPlanningDecisionToExecutionPlan(
  {
    tenantId,
    planningReport,
    decision,
  },
  {
    buildSteps(proposal, context) {
      return [{
        stepId: "step.001",
        action: "publish",
        input: { proposalId: context.proposalId },
      }];
    },
  },
);
```

## Status

Foundation v1 em implementação.
