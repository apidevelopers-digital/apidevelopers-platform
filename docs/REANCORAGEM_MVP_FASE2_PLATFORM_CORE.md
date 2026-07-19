# REANCORAGEM CANÔNICA — MVP FASE 2 PLATFORM CORE

**Data:** 2026-07-19  
**Status:** PLATFORM_CORE_CONSOLIDADO_PARA_REVISAO  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Risco:** R2  
**Merge:** NÃO EXECUTADO  
**Deploy:** NÃO EXECUTADO  

## 1. Direção da Fase 2

A prioridade desta fase é estabilizar contratos centrais reutilizáveis antes de expandir o Portal do Desenvolvedor ou o painel administrativo.

O Gateway permanece como camada HTTP e orquestradora. Regras genéricas foram extraídas para pacotes independentes no namespace `@apidevelopers/*`.

## 2. Pacotes consolidados

### `@apidevelopers/registry-core`

Responsável por:

- registro determinístico por chave;
- rejeição de duplicidade;
- filtros por visibilidade, status, tag e predicado;
- leituras clonadas;
- snapshots estáveis;
- ausência de persistência ou decisão de negócio.

O catálogo público do Gateway foi migrado para este pacote.

### `@apidevelopers/platform-core`

Responsável por:

- contexto imutável de requisição;
- normalização de método, URL, headers, query e `requestId`;
- erro tipado `PlatformError`;
- respostas JSON padronizadas;
- ocultação de detalhes internos em erros `5xx`.

O roteador e o servidor HTTP do Gateway usam esses contratos.

### `@apidevelopers/auth-core`

Responsável por:

- extração de API Key;
- autenticação administrativa e de clientes;
- identidade uniforme `{ role, principal }`;
- autorização por papel e escopo;
- comparação resistente a timing.

O adaptador `apps/api-gateway/src/security.mjs` mantém compatibilidade com o cadastro existente.

### `@apidevelopers/apikey-core`

Responsável por:

- geração de chaves no namespace `apid_`;
- hash SHA-256;
- verificação sem persistir segredo em texto puro;
- criação e revogação imutável de registros;
- representação pública sem hash;
- primitivas de ciclo de vida.

O cadastro de clientes, rotação e revogação do Gateway foram integrados ao pacote.

## 3. Integração no Gateway

Arquivos integrados:

- `apps/api-gateway/src/catalog.mjs`
- `apps/api-gateway/src/security.mjs`
- `apps/api-gateway/src/client-registry.mjs`
- `apps/api-gateway/src/app.mjs`
- `apps/api-gateway/src/server.mjs`
- `apps/api-gateway/package.json`

Versão interna do Gateway nesta fase: `0.3.0`.

Contratos preservados:

- catálogo público;
- OpenAPI;
- autenticação por API Key;
- cadastro e consulta de clientes;
- rotação e revogação de chaves;
- atualização de status;
- auditoria;
- rate limiting;
- servidor HTTP real.

## 4. Portal

O Portal do Desenvolvedor permanece simples.

Nenhuma expansão relevante de telas foi realizada nesta fase. A evolução visual e funcional deve ocorrer somente depois da estabilização do Core e da definição dos contratos administrativos seguintes.

## 5. Validação

Validação local executada com Node.js 22 e workspaces npm:

| Alvo | Testes aprovados |
|---|---:|
| `registry-core` | 3 |
| `platform-core` | 4 |
| `auth-core` | 3 |
| `apikey-core` | 3 |
| `api-gateway` | 11 |
| **Total** | **24** |

Resultado:

- 24 aprovados;
- 0 falhas;
- verificações de sintaxe aprovadas;
- nenhuma credencial real utilizada;
- nenhum deploy executado.

## 6. CI

O workflow `.github/workflows/api-gateway-mvp-ci.yml` foi atualizado para:

1. instalar os links dos workspaces;
2. validar individualmente os quatro pacotes de Core;
3. validar o Gateway integrado;
4. manter a conferência do Portal;
5. bloquear possíveis API Keys versionadas.

## 7. Limites atuais

Ainda não fazem parte desta consolidação:

- banco relacional ou serviço de segredos;
- cache ou rate limiting distribuído;
- autorização administrativa granular aplicada a todas as rotas;
- registry persistente e administrável por API;
- tracing distribuído;
- deploy, staging ou domínio remoto;
- expansão do Portal.

## 8. Próximo lote recomendado

1. aplicar `auth-core.authorize()` nas rotas administrativas com escopos explícitos;
2. introduzir contratos persistentes para Registry e clientes;
3. criar adapters de infraestrutura separados do Core;
4. ampliar OpenAPI com os envelopes padronizados;
5. adicionar testes de compatibilidade entre pacotes e Gateway;
6. somente depois retomar a expansão do Portal.

## 9. Estado operacional

- status: `PLATFORM_CORE_CONSOLIDADO_PARA_REVISAO`
- versão_origem: `MVP_FASE2_PLATFORM_CORE_2026-07-19`
- alvo: `sitedauni/apidevelopers-platform`
- decisão_milena: `PENDENTE`
- execução_igor: `EXECUTADA_NA_BRANCH_AUTORIZADA`
- deploy: `NÃO_EXECUTADO`
- evidência_técnica: pacotes, integração, testes locais e workflow versionados
- próximo_estado_permitido: revisão do Core e continuidade técnica na mesma branch
