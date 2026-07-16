# @apidevelopers/kernel-policy

Motor de política multi-tenant e `deny-by-default` da API Developers.digital.

## Responsabilidades

- classificar risco de R0 a R5;
- elevar jurídico e saúde para o piso R4;
- bloquear R5, segredos e conflitos constitucionais;
- vincular aprovação ao tenant, ação, decisão, proposta e hash do plano;
- recusar aprovação expirada, divergente ou reutilizada;
- liberar apenas prévia em dry-run sem aprovação;
- produzir decisão de política rastreável sem executar ações.

## API

```js
import {
  createPolicyEngine,
  hashExecutionPlan,
  policyRiskLevels,
} from "@apidevelopers/kernel-policy";
```

`PolicyEngine.evaluate()` retorna `allow`, `review` ou `deny`. O motor não chama adaptadores, não aprova e não executa.

## Invariantes

1. R5 sempre bloqueia.
2. Tenant é obrigatório e deve usar identificador opaco.
3. Execução real exige aprovação humana vinculada ao hash do plano.
4. Mudança no plano invalida a aprovação.
5. Aprovação não atravessa tenant, decisão, proposta ou ação.
6. Dry-run não autoriza mutação.
