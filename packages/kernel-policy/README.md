# @apidevelopers/kernel-policy

Gate de política multi-tenant, determinístico e `deny-by-default` entre a decisão governada e o runtime.

## Responsabilidades

- classificar risco de `R0` a `R5`;
- elevar jurídico, saúde e evidência para o piso `R4`;
- bloquear `R5`, segredos e conflitos constitucionais;
- vincular tenant, ciclo, decisão, proposta, ação e hash do plano;
- recusar aprovação expirada, divergente, consumida ou reutilizada;
- permitir prévia em `dry-run` sem aprovação;
- exigir aprovação humana válida para autorização de execução real;
- produzir decisão de política imutável e rastreável;
- nunca executar ações.

## Invariantes

1. `R5` sempre bloqueia.
2. `constitutionalConflictFree` precisa ser `true`.
3. Tenant, ciclo, decisão, proposta e ação devem permanecer vinculados.
4. Mudança no plano invalida a aprovação.
5. Aprovação não atravessa tenant, ciclo, decisão, proposta ou ação.
6. `dry-run` nunca autoriza execução ou mutação.
7. O kernel apenas decide política; o runtime continua exigindo confirmação explícita.
8. A saída é profundamente imutável.

## API

```js
import {
  createPolicyEngine,
  hashExecutionPlan,
  policyRiskLevels,
} from "@apidevelopers/kernel-policy";
```

`PolicyEngine.evaluate()` retorna `allow`, `review` ou `deny`.

Marcador institucional: `KERNEL_POLICY_GATE_OK`.
