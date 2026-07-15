# @apidevelopers/guard

Serviço canônico de políticas, risco e aprovações da API Developers.digital.

## Responsabilidades

- classificar ações por risco;
- avaliar políticas antes da execução;
- exigir aprovação explícita quando necessário;
- bloquear ações proibidas ou sem evidência suficiente;
- gerar eventos e auditoria para cada decisão.

## Classificação de risco

- `R0`: público
- `R1`: operacional interno simples
- `R2`: estratégico ou confidencial leve
- `R3`: dado pessoal ou operação sensível
- `R4`: jurídico, saúde, prova, documento sensível ou alta consequência
- `R5`: segredo, credencial, ilegalidade ou risco crítico

## Regras permanentes

1. Risco incerto é elevado ao nível mais alto aplicável.
2. Conteúdo jurídico e saúde sensível têm piso R4.
3. R5 bloqueia por padrão.
4. Ações sensíveis exigem aprovação explícita e evidência posterior.
5. Autorização não elimina auditoria, rollback ou limites de tenant.
6. Dry-run é preferido quando disponível.
7. Decisões de política não pertencem a produtos específicos.

## Contratos iniciais

- `RiskClassification`
- `PolicyDecision`
- `ApprovalRequest`
- `ApprovalRecord`
- `GuardEvaluation`
- `BlockReason`

## Critérios de conclusão

- testes de R0 a R5 passam;
- R4 exige approval gate;
- R5 não pode ser executado;
- cada decisão gera evento e auditoria;
- contexto de tenant é preservado.

## Status

Foundation v1 em implementação.
