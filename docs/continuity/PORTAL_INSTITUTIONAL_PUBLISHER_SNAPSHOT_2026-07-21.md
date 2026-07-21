# Snapshot de continuidade — publisher institucional do Portal

**Data:** 2026-07-21  
**Status:** VALIDADO_EM_BRANCH_LIMPA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch limpa:** `work/portal-projector-institutional-publisher-clean-20260721`  
**HEAD inicial reancorado:** `af522593ab4ecf6c6615871f4c4dd79ec65f54b5`

## Escopo

Foi criada uma operação interna explícita que executa a fachada institucional e publica o resultado no armazenamento derivado.

Consumidores continuam recebendo apenas `derived-store.reader`, com `mutationAllowed: false`.

## Microcommits limpos

1. `297d1b86b5d297e2d95dfff57b788c424aab4b1e` — implementação do publisher institucional.
2. `d4cbd111c7ce740ff1a149a3868164efaf685bd6` — testes de integração.
3. `d87b8f1ba8117212490834f6535889ebc721a38d` — exportação por subpath.
4. `d7f5b407b02953665f87b1467040e0ba0c464a8b` — inclusão na matriz CI.
5. `700c959b62b87766b3abe772e5147f609115b3c8` — contrato arquitetural.

## Capacidades

- projeção e publicação em uma operação interna;
- opções padrão e sobrescritas por chamada;
- idempotência;
- controle otimista;
- bloqueio de publicação quando a projeção falha;
- validação de commit e checksum do recibo;
- separação entre writer interno e reader externo;
- ausência de escrita canônica.

## Validação limpa

Workflow: `Portal Projector CI`

- Run ID: `29792448686`
- SHA: `d7f5b407b02953665f87b1467040e0ba0c464a8b`
- status: `completed`
- conclusão: `success`
- matriz: 11 arquivos

## Reancoragem

A branch compartilhada avançou com `docs(architecture): define architecture exception model`.

A promoção da branch antiga foi bloqueada e o lote foi reaplicado integralmente sobre `af522593…`, preservando o novo documento arquitetural global.

## Limites

- armazenamento ainda efêmero;
- sem fila ou agendamento;
- sem API HTTP;
- sem autenticação;
- sem release ou deploy;
- sem escrita no Git.

## Próximo passo exclusivo

Criar uma fachada de consulta read-only sobre `derived-store.reader`, preparada para futura API HTTP sem acoplar transporte, autenticação ou persistência.
