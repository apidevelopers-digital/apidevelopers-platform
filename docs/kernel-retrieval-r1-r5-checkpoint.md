# Kernel Retrieval — checkpoint R1–R5

**PR:** #689  
**Branch:** `ada/kernel-retrieval-federation-v1`  
**Estado:** revisão técnica concluída na branch; sem merge e sem deploy.

## Confirmado

- R1 contrato federado implementado.
- R2 adaptadores corporativos implementados: e-mail, WhatsApp, documentos/Drive e calendário.
- R3 Peterle/Mitra implementado em modo read-only.
- R4 imuni./EHR implementado com gate clínico e minimização.
- R5 conteúdo completo governado implementado com aprovação humana, autorização, política, auditoria, redação e limites.
- Compatibilidade do import legado de `content-gate.mjs` redirecionada para o gate corrigido v2.
- `Kernel Retrieval CI` aprovado no head `a373a365c2afa9b19c3ace3c53913420e1113228`.
- `Platform Baseline CI` aprovado no mesmo head.
- PR permanece `draft`, `mergeable=true`, `mergeable_state=clean`.

## Pendente

- revisão humana final do PR;
- atualização do corpo do PR para refletir R1–R5 concluídos;
- decisão explícita para tirar de draft;
- decisão explícita para merge;
- wiring/credenciais de provedores reais onde ainda não foram validados;
- deploy/ativação em runtime;
- testes controlados de conteúdo real via R5 com aprovação por objeto.

## Bloqueado por segurança

- merge sem aprovação explícita;
- deploy sem aprovação explícita;
- leitura de conteúdo jurídico ou clínico real sem aprovação, autorização, política e auditoria no runtime;
- qualquer escrita em prontuário, processo, Drive, calendário, WhatsApp ou e-mail por esta camada.
