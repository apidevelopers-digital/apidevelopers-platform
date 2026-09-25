# Mitra MCP v1 — Inventário e Arquitetura-Alvo

Status: rascunho operacional  
Data: 2026-09-25  
Repositório de registro: `apidevelopers-digital/apidevelopers-platform`  
Escopo: Mitra, Lex, ADA Mitra Bridge, MCP, Skill jurídica e plataforma pública

## Objetivo

Padronizar a Mitra em uma arquitetura MCP-first, sem duplicar serviços jurídicos já existentes e sem transformar o ChatGPT em dono dos dados, segredos ou billing.

A arquitetura-alvo é:

```txt
ChatGPT / Milena / cliente
→ Mitra MCP
→ Skill jurídica Mitra
→ ADA/Gateway
→ Mitra Legal Orchestrator
→ Lex Legal API
→ fontes oficiais / cliente / documentos / auditoria
```

## Decisão arquitetural

A Mitra deve ser implementada como produto jurídico baseado em MCP.

- MCP é a camada de ferramentas, dados e conectores.
- Skill é o método jurídico de trabalho: como analisar, estruturar, revisar, não inventar e exigir fonte.
- Backend Mitra é a orquestração jurídica.
- Lex Legal API é o motor canônico de pesquisa jurídica e fontes oficiais.
- ADA/Gateway é a camada segura para tenants, tokens, secrets e autorização.
- Plataforma pública é a camada SaaS para clientes, usuários, casos, documentos, planos e billing.

## Inventário atual

| Repositório | Papel confirmado |
|---|---|
| `apidevelopers-platform` | Gateway institucional, ADA Mitra Bridge, Gateway Key Provisioner, Secret Writer institucional, runtime Hostinger |
| `mitra-legal-orchestrator` | Orquestrador jurídico canônico da Mitra para a Dra. Milena |
| `lex-legal-api` | Backend jurídico canônico da Lex para pesquisa jurídica, fontes oficiais e metadados públicos de processo |
| `auma-whatsapp-peterle` | Assistente WhatsApp da Milena/Peterle, potencial consumidor do backend Mitra/Lex |

## Papel de cada camada

### ADA / Gateway

Responsável por segurança institucional:

- emissão de API keys;
- rotação futura de credenciais;
- validação de tenant;
- Organization Secrets;
- runtime seguro;
- autorização por scopes;
- ponte read-only para ADA Mitra.

Status da frente ADA Mitra / Gateway Key Provisioner:

```txt
Operacionalmente fechada
Completion: 97%
```

Resultado já validado:

```txt
Gateway emite key real
→ salva ADA_MITRA_BRIDGE_READ_TOKEN como Organization Secret
→ libera para apidevelopers-platform
→ valida ADA Mitra Bridge
```

### Mitra Legal Orchestrator

Responsável por orquestrar o trabalho jurídico.

Conforme README do repositório `mitra-legal-orchestrator`, o objetivo da versão 1.0 é entregar um fluxo jurídico ponta a ponta sem reconstruir serviços já existentes:

```txt
cliente/caso
→ contexto seguro
→ fontes oficiais
→ Lex
→ Veritas
→ revisão humana
```

Princípios confirmados no README:

- somente leitura para dados de clientes;
- nenhum SQL arbitrário;
- nenhuma escrita no banco;
- retrieval-first;
- fontes oficiais antes da síntese;
- revisão humana obrigatória;
- política de não invenção;
- fail-closed quando dependência crítica não responde;
- não pratica ato jurídico autonomamente.

Rotas canônicas listadas:

```txt
GET /health
POST /v1/context
POST /v1/research
POST /v1/case
POST /v1/analyze
POST /v1/document
POST /v1/veritas
POST /v1/generate
```

### Lex Legal API

Responsável por pesquisa jurídica e fontes oficiais.

Conforme README do repositório `lex-legal-api`, o projeto centraliza pesquisa jurídica, fontes oficiais, metadados públicos de processo, operação read-only, política de não invenção, revisão humana e provedores externos read-only.

Provedores citados:

```txt
LexML SRU 1.1
STJ
Planalto
Senado Federal
CNJ DataJud, quando configurado
```

Rotas canônicas listadas:

```txt
GET /health
GET /v1/readiness
GET /v1/sources/registry
POST /v1/mitra/legal/search/global
POST /v1/search/global
POST /v1/search/jurisprudencia
POST /v1/search/legislacao
POST /v1/search/lexml
GET /v1/datajud/health
GET /v1/datajud/processos/{numeroCnj}
GET /v1/processos/{numeroCnj}
```

## O que não deve ser duplicado

A Mitra MCP não deve recriar o que a Lex já faz.

| Necessidade | Camada correta |
|---|---|
| Pesquisa jurisprudencial | Lex Legal API |
| Fontes oficiais | Lex Legal API |
| DataJud / CNJ | Lex Legal API |
| Síntese jurídica e workflow do caso | Mitra Legal Orchestrator |
| Contexto de cliente/caso | Mitra Legal Orchestrator / backend cliente |
| Segurança, key, tenant e secrets | ADA/Gateway |
| Interface ChatGPT | Mitra MCP + Skill |
| Conta, planos e billing | Plataforma pública |

## MCP Mitra v1 — ferramentas-alvo

Primeiro conjunto sugerido:

```txt
mitra.status
mitra.capabilities
mitra.contexto_cliente
mitra.buscar_jurisprudencia
mitra.pesquisar_fontes_oficiais
mitra.buscar_processo
mitra.analisar_caso
mitra.analisar_documento
mitra.comparar_precedentes
mitra.gerar_tese
mitra.gerar_minuta
mitra.veritas
```

### Mapeamento inicial

| Ferramenta MCP | Backend alvo |
|---|---|
| `mitra.status` | ADA Mitra Bridge / Gateway |
| `mitra.capabilities` | ADA Mitra Bridge / Gateway |
| `mitra.contexto_cliente` | Mitra Legal Orchestrator |
| `mitra.buscar_jurisprudencia` | Lex Legal API |
| `mitra.pesquisar_fontes_oficiais` | Lex Legal API |
| `mitra.buscar_processo` | Lex Legal API / DataJud |
| `mitra.analisar_caso` | Mitra Legal Orchestrator |
| `mitra.analisar_documento` | Mitra Legal Orchestrator |
| `mitra.comparar_precedentes` | Mitra Legal Orchestrator + Lex |
| `mitra.gerar_tese` | Mitra Legal Orchestrator |
| `mitra.gerar_minuta` | Mitra Legal Orchestrator |
| `mitra.veritas` | Mitra Legal Orchestrator / Veritas |

## Skill jurídica Mitra

A Skill não substitui o MCP nem o backend.

Ela deve registrar o método jurídico de trabalho:

- separar fatos, pedidos, provas, fundamentos e riscos;
- nunca inventar jurisprudência;
- exigir fonte oficial ou informar indisponibilidade;
- distinguir dado recuperado, inferência e sugestão;
- sinalizar necessidade de revisão humana;
- manter linguagem jurídica compatível com a Dra. Milena;
- proteger dados sensíveis;
- não praticar ato jurídico autônomo;
- usar ferramentas MCP quando precisar buscar dados reais.

## Plataforma pública

A plataforma pública deve ser o painel SaaS da Mitra.

Funções previstas:

```txt
criar tenant
gerenciar usuários
gerenciar casos
subir documentos
visualizar pesquisas
controlar fontes
conectar ChatGPT/MCP
acompanhar uso
billing
permissões
auditoria
```

O cliente não deve copiar token técnico manualmente em operação normal.

Fluxo ideal:

```txt
cliente compra plano
→ cria tenant
→ cadastra usuários
→ conecta Mitra MCP ao ChatGPT
→ usa ferramentas jurídicas
→ plataforma audita uso e billing
```

## Modelo de cobrança e tokens

Separar claramente:

| Tipo | Função | Controle |
|---|---|---|
| OpenAI API key | Usada somente se backend chamar OpenAI por conta própria | API Developers ou BYOK do cliente |
| MCP/OAuth token | Autoriza ChatGPT a usar a Mitra daquele tenant | Plataforma Mitra |
| Internal API key | Backend/Gateway/Mitra/Lex | API Developers |
| Tenant/user/session | Controle de cliente, usuário, permissões e billing | Plataforma Mitra |

Para uso dentro do ChatGPT via MCP, o cliente usa a própria sessão/ambiente ChatGPT. A API Developers cobra o SaaS Mitra, as ferramentas, dados, armazenamento, automações, conectores e uso de plataforma.

## Segurança e governança

Regras base:

- nenhum segredo no Git;
- nenhum segredo no chat;
- nenhum segredo em artifact/log;
- fail-closed em dependência crítica;
- read-only por padrão;
- fontes oficiais antes da síntese;
- revisão humana obrigatória;
- scopes por ferramenta;
- tenant isolation;
- auditoria por chamada MCP;
- logs sem conteúdo jurídico sensível quando possível;
- rotação de credenciais prevista.

## Próximas etapas

1. Auditar rotas reais do `mitra-legal-orchestrator`.
2. Auditar rotas reais do `lex-legal-api`.
3. Definir contrato HTTP interno do Mitra MCP v1.
4. Criar servidor MCP Mitra v1.
5. Criar Skill jurídica Mitra v1.
6. Criar fluxo de tenant/plano/conexão MCP na plataforma pública.
7. Migrar o secret writer transitório para GitHub App / MCP credential broker institucional.

## Status

Esta é uma arquitetura-alvo e inventário operacional. Não representa que o MCP Mitra já está pronto.

| Frente | Status |
|---|---|
| ADA Mitra Bridge / Secret Writer | pronto operacionalmente |
| Mitra Legal Orchestrator | existe e deve ser backend jurídico |
| Lex Legal API | existe e deve ser motor de fontes/pesquisa |
| Mitra MCP v1 | pendente |
| Skill jurídica Mitra v1 | pendente |
| Plataforma pública Mitra | pendente/integrar |
