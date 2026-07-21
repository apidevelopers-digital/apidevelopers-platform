# Snapshot de continuidade — publisher institucional do Portal

**Data:** 2026-07-21  
**Status:** VALIDADO_EM_BRANCH  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-institutional-publisher-20260721`  
**HEAD inicial:** `207e7fbe082e70523f199d398336278acac87862`

## Escopo

Foi criada uma operação interna explícita que executa a fachada institucional e publica o resultado no armazenamento derivado.

Consumidores continuam recebendo apenas `derived-store.reader`, com `mutationAllowed: false`.

## Microcommits

1. `d5991481767471ab9a1be7b31bb8846778cff3fa` — implementação do publisher institucional.
2. `3b9310f4c4a9c3166e7b3a566b240a7b89b63a2b` — testes de integração.
3. `4cb22ba88968addabbbe673676e14dc94ef23bb9` — exportação por subpath.
4. `5c99a96a7166a330a42a8bf4c10cc8735c59c3bc` — inclusão na matriz CI.

## Capacidades

- projeção e publicação em uma operação interna;
- opções padrão e sobrescritas por chamada;
- idempotência;
- controle otimista;
- bloqueio de publicação quando a projeção falha;
- validação de commit e checksum do recibo;
- separação entre writer interno e reader externo;
- ausência de escrita canônica.

## Validação

Workflow: `Portal Projector CI`

- Run ID: `29792299533`
- SHA: `5c99a96a7166a330a42a8bf4c10cc8735c59c3bc`
- status: `completed`
- conclusão: `success`
- matriz: 11 arquivos

## Limites

- armazenamento ainda efêmero;
- sem fila ou agendamento;
- sem API HTTP;
- sem autenticação;
- sem release ou deploy;
- sem escrita no Git.

## Próximo passo exclusivo

Criar uma fachada de consulta read-only sobre `derived-store.reader`, preparada para futura API HTTP sem acoplar transporte, autenticação ou persistência.
