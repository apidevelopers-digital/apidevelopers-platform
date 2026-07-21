# Snapshot de continuidade — CI do Portal Projector

**Data:** 2026-07-21  
**Status:** VALIDADA_EM_BRANCH_LIMPA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch limpa:** `work/portal-projector-ci-clean-20260721`  
**HEAD inicial reancorado:** `171e6c018ae02f6ee7387429eaf45ff68df1f699`

## Escopo

Foi criada uma CI segmentada e somente leitura para `packages/portal-projector`, com execução matricial dos nove arquivos de teste.

O lote também corrigiu defeitos reais revelados pela primeira execução integral da suíte.

## Microcommits limpos

1. `2608335e8d70ca3542f447cbe7facfb9561f6808` — corrige extrator tipado.
2. `aec72b7fa426745e4139673138aefa2ff5ee689f` — corrige provider GitHub.
3. `0c67b3529135540e11a7f75de7755349104befe0` — corrige contrato do teste da fachada.
4. `f6eae71bd30cbdeb1bd212294c84b5b8a0a885fd` — adiciona CI matricial segmentada.

## Defeitos identificados

- erro sintático na atualização de contagens do extrator;
- propriedade `mutationAllowed` digitada incorretamente;
- parêntese ausente na validação de repositório do provider;
- código de erro esperado digitado incorretamente no teste da fachada.

Nenhum defeito foi mascarado no workflow. A promoção ficou bloqueada até a suíte completa ficar verde.

## Validação

Workflow:

`Portal Projector CI`

Run limpo:

- ID: `29791186598`
- SHA: `f6eae71bd30cbdeb1bd212294c84b5b8a0a885fd`
- status: `completed`
- conclusão: `success`
- jobs matriciais: 9 arquivos

## Segurança

- `permissions: contents: read`;
- sem segredos;
- sem rede externa real nos testes;
- sem escrita no Git;
- sem merge, release ou deploy;
- sem force push.

## Próximo passo exclusivo

Após promoção e conferência do workflow no SHA compartilhado, avaliar armazenamento derivado somente leitura ou API HTTP de consulta, sem alterar a fonte canônica.
