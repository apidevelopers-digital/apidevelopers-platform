# Registro operacional dos chats

**Status:** ativo  
**Objetivo:** coordenar até seis chats paralelos sem duplicar arquitetura, inflar percentuais ou sobrescrever trabalho.

## 1. Regra central

Cada chat mantém seu próprio handoff em `docs/coordination/handoffs/`.

Somente a frente de consolidação altera:

- `docs/coordination/chat-workstreams.json`;
- estado global das frentes;
- dependências entre branches;
- percentuais institucionais;
- status de consolidação.

## 2. Frentes reservadas

| ID | Frente | Responsabilidade | Estado inicial |
|---|---|---|---|
| `chat-master` | Chat Mestre | decisões, prioridades, arquitetura transversal e percentuais globais | `aguardando-handoff` |
| `platform-engineering` | Engenharia da Plataforma | kernels, gateway, segurança, storage, workers e CI | `awaiting-handoff` |
| `portal-unified` | Portal unificado | UX, acessibilidade, módulos, telas e integração Chat + Portal | `aguardando-handoff` |
| `ops-integrations` | Operações e integrações | clientes, WhatsApp, Meta, VNNOX, mídia, financeiro, site e infraestrutura | `aguardando-handoff` |
| `learning-systems` | Aprendizado supervisionado | memória, reflexão, evolução, publisher, snapshots e projeções | `awaiting-handoff` |
| `consolidation-quality` | Consolidação e qualidade | branches, PRs, CIs, supersessões, documentação e percentuais | `em-execucao` |

## 3. Estados permitidos

- `planejada`
- `em-execucao`
- `validada-isoladamente`
- `pronta-para-consolidar`
- `consolidada`
- `bloqueada`
- `supersedida`
- `awaiting-handoff`

## 4. Contrato de handoff

Cada handoff deve informar:

- ID da frente;
- objetivo;
- branch base;
- branch de trabalho;
- HEAD inicial e atual;
- arquivos e contratos alterados;
- testes e CIs;
- bloqueios;
- dependências;
- status de consolidação;
- percentual da frente;
- impacto estimado no programa global;
- próximo passo único.

## 5. Regras de conflito

1. Nenhum chat especializado redefine decisão canônica.
2. Uma frente só altera seus próprios arquivos e handoff.
3. Somente `consolidation-quality` atualiza o registro central.
4. Branch com CI verde não está consolidada até ser absorvida pela branch de integração definida.
5. Nenhuma frente atualiza sozinha o percentual institucional global sem cruzar evidências de integração.

## 6. Prioridade atual

Coletar os seis handoffs, identificar superposições e criar a matriz única de capacidades, branches, CIs, dependências e pendìncias.
