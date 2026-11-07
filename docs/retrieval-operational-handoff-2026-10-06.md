# Handoff — Retrieval Operacional

Data: 2026-10-06  
Repo: `apidevelopers-digital/apidevelopers-platform`  
PR atual: #693  
Branch: `ada/retrieval-operational-bootstrap-v1`  
Base: `main`  
Main confirmado: `70f92b2d805e21b79c3e1e10906866bb99035226`  
Head antes deste handoff: `a94df452dc8bfc42d54dad0d50621ef268848f69`

## Confirmado

- PRs #689, #690 e #691 já foram mergeados e formam a base desta frente.
- PR #693 está aberto, Draft e `mergeable=clean`.
- `RETRIEVAL_ENABLED` ausente ou `false` mantém o bootstrap `disabled`.
- Modo desabilitado não inicializa providers e recusa `search`/`fetchContent`.
- `RETRIEVAL_ENABLED=true` sem wiring governado explícito falha fechado.
- O startup Hostinger passa pelo bootstrap antes das demais composições.
- Nesta etapa não há providers reais no bundle.
- Não houve deploy, ativação de feature flag, leitura real ou alteração de kill-switch.

## Evidência CI no head anterior

Em `a94df452dc8bfc42d54dad0d50621ef268848f69` estavam verdes:

- API Gateway CI
- Platform Baseline CI
- API Gateway Managed Hosting CI
- Trust M3 Operational CI
- Trust M3 Packaging CI
- Zuni Channel Binding Hostinger Wiring CI

Este commit de handoff cria novo head; conferir novamente os CIs antes de retirar o Draft.

## Pendente

1. Confirmar CIs do novo head.
2. Se todos verdes, marcar #693 como `Ready for Review`.
3. Parar antes do merge e pedir aprovação explícita.
4. Em etapa separada, preparar bundle governado real de `@apidevelopers/kernel-retrieval` com providers aprovados e auth/authz/policy/audit/redaction.
5. Rodar `createRetrievalActivationPreflight` antes de qualquer ativação real.
6. Deploy e `RETRIEVAL_ENABLED=true` exigem aprovações explícitas separadas.
7. R5 real continua exigindo aprovação por objeto/finalidade.

## Bloqueado sem aprovação explícita

Merge, deploy, mudança de feature flag, alteração de kill-switch, leitura real de e-mail/WhatsApp/documento/processo/prontuário, fetch R5, escrita em sistemas de origem e envio de mensagens.

Este arquivo é checkpoint de continuidade e não substitui documentos de autoridade.
