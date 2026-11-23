# ChatGPT Plugins Registry — API Developers.digital

Status: draft  
Data: 2026-11-23  
Branch: `registry/chatgpt-plugins-20261123`

## Modelo atual

A API Developers.digital deve ser exposta ao ChatGPT por **macroplugins operacionais**, e não por dezenas de plugins pequenos.

Motivo: a instituição tem centenas de ferramentas, actions, tenants, produtos, bancos, nodes e integrações. Um plugin gigante quebra o catálogo; muitos plugins pequenos ficam inviáveis para operação diária. O modelo correto é um meio-termo: poucos plugins grandes, com submódulos internos e política forte de risco.

## Macroplugins oficiais propostos

| Macroplugin | Escopo | Risco | Modo padrão | Status |
|---|---|---:|---|---|
| `ada-infra` | MCP, VPS, Docker, Hostinger, DNS, GitHub, PRs, workflows, deploy, rollback, backups, crons, bancos, logs | Alto | read-only / dry-run | em desenho |
| `ada-juri` | uni.juri, Peterle, Milena, Peter Advocacia, Mitra, HomoSapiens jurídico, jurisprudência, documentos, dossiês, petições, evidências, DJEN, legal search, revisão humana | Alto jurídico | read-only / rascunho / dry-run | prioridade |
| `ada-comunicacao` | Zuni, WhatsApp 5001, WhatsApp 6610, HIDDEN, templates, inbox, handoff humano, rascunhos, envio aprovado, e-mail institucional, Instagram DM/comentários de atendimento | Alto | rascunho / dry-run | prioridade |
| `ada-media` | Reels, ElevenLabs, áudio, ffmpeg, assets, BrandKit, campanhas, Meta social, Instagram posts/stories, VNNOX packages, telões, render, upload de mídia | Médio/alto | pacote / rascunho / dry-run | em desenho |
| `ada-produtos` | Único, Zuni produto, Hidden Archives/Raiden, HomoSapiens interfaces, Nexus, Trust/Radar, Thor/EMC2, Universo, sites institucionais, billing/checkout | Médio/alto | read-only / dry-run | em desenho |
| `ada-clinico` | imuni clínico, anamnese, consulta, documentos clínicos, áudio clínico, pacientes, orientações, encaminhamentos, rascunhos de receita/atestado | Alto clínico | apoio / rascunho / revisão humana | prioridade isolada |

Opcional futuro: `ada-financeiro`, se billing/cobrança/checkout justificarem separação de `ada-produtos`.

## Princípios

1. Não criar um plugin único com todas as ferramentas.
2. Não criar dezenas de plugins que inviabilizem a operação.
3. Cada macroplugin pode ter submódulos internos.
4. O catálogo interno MCP pode ser completo; o OpenAPI exposto ao ChatGPT deve ser pequeno e organizado.
5. Ações reais exigem confirmação explícita.
6. GitHub é a memória viva; hotfix em VPS deve ser reconciliado em PR.
7. Dados de cliente, clínicos, jurídicos e financeiros não devem ser expostos por padrão.

## Classificação de risco

| Risco | Descrição | Política |
|---|---|---|
| R1 | leitura pública ou baixa sensibilidade | permitido |
| R2 | leitura interna/sensível | permitido com escopo e limite |
| R3 | escrita reversível, rascunho ou dry-run | dry-run primeiro |
| R4 | produção, cliente, envio, deploy, publicação | confirmação explícita |
| R5 | destrutivo, financeiro crítico, DNS, exclusão | confirmação forte, conferência e backup/diff quando possível |

## Submódulos por macroplugin

### `ada-infra`

Inclui `core.operator`, `mcp.registry`, `github.devops`, `hostinger.infra`, `vps.docker`, `dns`, `nodejs.builds`, `databases`, `crons`, `logs`, `deploy.rollback`.

### `ada-juri`

Inclui `unijuri`, `peterle.mitra`, `milena.product`, `peter.advocacia`, `homosapiens.legal`, `jurisprudencia`, `djen`, `legal.search`, `documents`, `dossies`, `peticoes`, `evidencias`, `human.review`.

#### Entrada canônica confirmada — Peterle/Milena/Peter Advocacia

| Campo | Valor |
|---|---|
| Produto/domínio | Peterle / Milena / Peter Advocacia |
| Banco | `u398929082_clientes` |
| Tenant Hostinger | `peterle` / `u398929082` |
| Domínios | `peterle.adv.br`, `mitra-api.peterle.adv.br`, `clientes.homosapiens.id` |
| Macroplugin destino | `ada-juri` |
| Submódulo | `peterle.mitra` |
| Risco | Alto |
| Modo padrão | read-only / dry-run |
| Escrita/envio/deploy | somente com confirmação explícita |

Componentes confirmados: `peterle-ops.apidevelopers.digital`, `mitra-api.peterle.adv.br`, `peterle.adv.br`, `clientes.homosapiens.id`, `app.homosapiens.id`, `lex.homosapiens.id`, `biblioteca.homosapiens.id`, `chefsapiens.homosapiens.id`, `sensus.homosapiens.id`, `visio.homosapiens.id`, `intuitus.homosapiens.id`, `littera.homosapiens.id`, `vita.homosapiens.id`.

Dados confirmados: Hostinger tenant Peterle/Milena existe; usuário de hospedagem `u398929082`; banco principal `u398929082_clientes`; Mitra runtime responde via `peterle-ops`; há dados reais de clientes, documentos e objetos; e-mail `milena@peterle.adv.br` está mapeado, mas IMAP falhou em conferência anterior; GitHub via `peterle-ops` autentica como `sitedauni`, e organização externa da Milena/Peterle ainda não foi confirmada.

### `ada-comunicacao`

Inclui `zuni`, WhatsApp 5001, WhatsApp 6610, WhatsApp HIDDEN, templates, inbox, handoff humano, rascunhos, envio aprovado, e-mail institucional, `communicationHub`, Instagram DM/comentários quando forem atendimento.

### `ada-media`

Inclui Reels, ElevenLabs, áudio, ffmpeg, pacotes de mídia, assets, BrandKit, Instagram posts/stories, campanhas, VNNOX packages, telões, render e upload de mídia.

### `ada-produtos`

Inclui Único, Zuni produto, Hidden Archives/Raiden, HomoSapiens interfaces não jurídicas, Nexus, Trust/Radar, Thor/EMC2, Universo, sites API Developers.digital/Site da Uni e billing/checkout.

### `ada-clinico`

Inclui imuni clínico, anamnese, consulta, documentos clínicos, áudio clínico, pacientes, orientações, encaminhamentos e rascunhos de receita/atestado.

## Ordem de implementação

1. `ada-infra`
2. `ada-juri`
3. `ada-comunicacao`
4. `ada-media`
5. `ada-produtos`
6. `ada-clinico`

## Pendências próximas

1. Ajustar a estrutura do PR para macroplugins, evitando muitos diretórios pequenos.
2. Gerar `ada-infra/openapi.yaml` primeiro.
3. Gerar `ada-juri/openapi.yaml` em seguida.
4. Reconciliar o hotfix do MCP tools do VPS com o repositório.
5. Completar inventário DNS/NodeJS/crons do tenant Peterle/Milena.
6. Expandir o registry com as Actions e domínios restantes.
