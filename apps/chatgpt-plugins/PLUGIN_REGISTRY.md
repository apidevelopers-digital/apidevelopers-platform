# ChatGPT Plugins Registry — API Developers.digital

Status: draft  
Data: 2026-11-23  
Branch: `registry/chatgpt-plugins-20261123`

## Princípios

1. Não criar plugin gigante.
2. Não perder ferramentas existentes.
3. Registrar cada produto/domínio, tenant, runtime, banco, node, action e plugin destino.
4. Expor ao ChatGPT somente schemas pequenos por domínio.
5. Manter catálogo completo internamente no MCP/registry.
6. GitHub é a memória viva; VPS/hotfix emergencial deve ser reconciliado em PR.
7. Ações reais exigem confirmação explícita.

## Classificação de risco

| Risco | Descrição | Política |
|---|---|---|
| R1 | leitura pública ou baixa sensibilidade | permitido |
| R2 | leitura interna/sensível | permitido com escopo |
| R3 | escrita reversível, rascunho ou dry-run | dry-run primeiro |
| R4 | produção, cliente, envio, deploy, publicação | confirmação explícita |
| R5 | destrutivo, financeiro crítico, DNS, exclusão | confirmação forte e conferência |

## Registro inicial de plugins

| Plugin destino | Produto/domínio | Infra/tenant | Risco | Modo padrão | Status |
|---|---|---|---|---|---|
| `ada-core-operator` | Operador ADA / MCP / VPS | `mcp.apidevelopers.digital`, VPS `srv2028303` | Alto | read-only/dry-run | confirmado parcial |
| `ada-github-devops` | GitHub institucional | org `apidevelopers-digital` | Alto | read-only, branch antes de escrita | confirmado parcial |
| `ada-hostinger-infra` | Hostinger/API Developers | tenant API Developers / Uni | Alto | read-only/dry-run | confirmado parcial |
| `ada-unico-platform` | Único / 5001 / runtime Node | `unico.sitedauni.com`, repo `unico-api-platform` | Alto | read-only/dry-run | confirmado parcial |
| `ada-zuni-communications` | Zuni / WhatsApp / handoff | canais 5001, 6610, HIDDEN | Alto | rascunho/dry-run | confirmado parcial |
| `ada-media-reels` | Reels / ElevenLabs / ffmpeg | `mcp-api`, pacotes em runtime | Alto | dry-run/materialização segura | confirmado parcial |
| `ada-vnnox-teloes` | Telões / VNNOX | VNNOX players | Alto | leitura primeiro | confirmado parcial |
| `ada-hidden-archives` | Hidden Archives / Raiden | `hiddenarquives.tech` | Médio/alto | read-only/dry-run | confirmado parcial |
| `ada-imuni-clinical` | imuni clínico | `imuni`, `imuni-mcp`, `imuni-audio-hml` | Alto/clínico | apoio/rascunho | confirmado parcial |
| `ada-unijuri` | uni.juri | repo `uni_juri`, `juri-mcp`, `unijuri.sitedauni.com` | Alto/jurídico | leitura/rascunho/revisão humana | confirmado parcial |
| `ada-peterle-mitra` | Peterle / Milena / Peter Advocacia | tenant Peterle / `u398929082` | Alto/jurídico | read-only/dry-run | confirmado |

## Entrada canônica — ada-peterle-mitra

| Campo | Valor |
|---|---|
| Produto/domínio | Peterle / Milena / Peter Advocacia |
| Banco | `u398929082_clientes` |
| Tenant Hostinger | `peterle` / `u398929082` |
| Domínios | `peterle.adv.br`, `mitra-api.peterle.adv.br`, `clientes.homosapiens.id` |
| Plugin destino | `ada-peterle-mitra` |
| Risco | Alto |
| Modo padrão | read-only / dry-run |
| Escrita/envio/deploy | somente com confirmação explícita |

### Componentes confirmados

- `peterle-ops.apidevelopers.digital`
- `mitra-api.peterle.adv.br`
- `peterle.adv.br`
- `clientes.homosapiens.id`
- `app.homosapiens.id`
- `lex.homosapiens.id`
- `biblioteca.homosapiens.id`
- `chefsapiens.homosapiens.id`
- `sensus.homosapiens.id`
- `visio.homosapiens.id`
- `intuitus.homosapiens.id`
- `littera.homosapiens.id`
- `vita.homosapiens.id`

### Dados operacionais confirmados

- Hostinger tenant Peterle/Milena existe.
- Usuário de hospedagem: `u398929082`.
- Banco principal: `u398929082_clientes`.
- Mitra runtime responde via `peterle-ops`.
- Há dados reais de clientes, documentos e objetos.
- E-mail `milena@peterle.adv.br` está mapeado, mas IMAP falhou em conferência anterior e precisa correção de credencial/app password.
- GitHub via `peterle-ops` autentica como `sitedauni`; organização externa da Milena/Peterle ainda não confirmada.

### Política de segurança

- Não expor dados de clientes no ChatGPT por padrão.
- Não enviar e-mail real sem confirmação.
- Não executar deploy em `mitra-api.peterle.adv.br` sem dry-run e confirmação.
- Não executar alterações de banco sem confirmação explícita e plano de rollback.
- Preferir endpoints read-only: busca, diretório, resolução e auditoria.

## Próximas pendências

1. Completar inventário DNS do tenant Peterle/Milena.
2. Listar builds NodeJS de `app.homosapiens.id` e `lex.homosapiens.id`.
3. Mapear crons/jobs do tenant `u398929082`.
4. Confirmar bancos adicionais além de `u398929082_clientes`.
5. Confirmar se existe GitHub/instalação separada para Peterle/Milena.
6. Expandir registry com todos os produtos/domínios encontrados nas Actions e Hostinger.
