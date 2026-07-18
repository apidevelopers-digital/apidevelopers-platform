# Auditoria consolidada de repositórios e ativos — 2026-07-17

Status: preparado para revisão  
Escopo: `sitedauni/apidevelopers-platform` e `sitedauni/unico-api-platform`  
Modo: somente leitura na auditoria; nenhum merge, deploy ou workflow manual executado

## 1. Resumo executivo

A fundação técnica está concentrada em `apidevelopers-platform`, principalmente na branch
`foundation/global-platform-bootstrap-20260715`. O legado operacional e os protótipos
permanecem distribuídos em `unico-api-platform`.

O principal risco atual não é ausência de implementação. É fragmentação:

- dois centros arquiteturais;
- dezenas de branches no legado;
- excesso de workflows operacionais;
- MVPs e bridges sem promoção formal;
- ausência de catálogo oficial com estado verificável por ativo.

## 2. Estado por repositório

### apidevelopers-platform

- branch principal de trabalho: `foundation/global-platform-bootstrap-20260715`;
- contratos, Registry, Policy Engine, Factory Runtime e documentação presentes;
- Platform CI com execução recente bem-sucedida;
- Registry CI com falha de configuração;
- nenhum PR aberto para promover a fundação;
- branches sem proteção observada.

### unico-api-platform

- runtime legado, bridges, integrações e protótipos;
- grande volume de branches e workflows;
- PRs recentes permanecem em draft;
- ativos relevantes existem, porém sem processo único de certificação;
- deve ser tratado como fonte de migração e compatibilidade, não como berço de novos ativos.

## 3. Inventário inicial de ativos

| Ativo | Evidência encontrada | Estado atual | Próxima ação |
|---|---|---|---|
| AP Guard | branches `feat/uni-guard-api` e `feat/uni-guard-v1-clean` | protótipo avançado | escolher implementação canônica e promover |
| AP WhatsApp | MVP, bridges WATI e VART | operacional fragmentado | separar contrato, adapter WATI e VART |
| AP Memory | PR draft, bridge e branches antigas | MVP não promovido | validar isolamento e migrar contrato |
| AP Radar | branches v1/clean, bridge e workflows | operacional fragmentado | consolidar versão canônica |
| AP VNNOX | signer, bridge, correções e diagnósticos | integração com dívida histórica | consolidar leitura, ações e eventos |
| AP Finance | bridge e diversos patches | operacional parcialmente acoplado | extrair do runtime legado |
| AP Media | versões comercial e clean | reconstrução | selecionar base canônica |
| uni.core | PR draft com schemas | fundação paralela | reconciliar com contratos da plataforma |
| Conversation Engine | PR draft | MVP de domínio | completar contrato, testes e integração |
| API Module Generator | PR draft | protótipo de Factory | absorver componentes úteis |
| uni.letra | PR draft | MVP determinístico | registrar como capability experimental |

## 4. Decisões recomendadas

1. `apidevelopers-platform` passa a ser a fonte oficial de contratos, Factory e ativos.
2. `unico-api-platform` entra em modo legado controlado e migração progressiva.
3. Nenhum ativo é considerado oficial sem manifesto, contrato, testes, políticas,
   observabilidade e evidência de promoção.
4. A primeira onda de promoção deve seguir:
   Guard, WhatsApp, Memory, Radar, VNNOX, Finance e Media.
5. Workflows temporários e patches antigos devem ser classificados antes de remoção.

## 5. Backlog imediato

### P0 — estabilização

- corrigir o Registry CI;
- manter Platform CI verde;
- abrir PR da fundação para revisão;
- definir proteção de `main`;
- preparar release inicial sem deploy automático.

### P1 — Asset Registry

- criar Asset Card canônico;
- registrar owner, dependências, consumidores, contratos, eventos e maturidade;
- importar os sete ativos prioritérios;
- calcular score inicial baseado em evidências.

### P2 — redução do legado

- classificar workflows como canônico, temporário, diagnóstico ou concluído;
- encerrar branches já convergidas;
- extrair bridges do runtime monolítico;
- manter compatibilidade e rollback durante cada migração.

## 6. Gates

Nenhum merge, deploy, publicação, cobrança, envio, alteração de DNS ou ação real em
provedores está autorizado por este documento.

Próximo estado permitido: revisão técnica da branch de fundação e correção do gate
dedicado do Registry.
