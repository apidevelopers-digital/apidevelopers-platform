# Mapa de frentes e chats — 2026-07-21

**Status:** regra operacional de coordenação

## 1. Estrutura recomendada

### Chat Mestre

Responsável por:

- visão institucional;
- prioridades;
- arquitetura transversal;
- decisões de produto;
- percentuais globais;
- autorização de consolidação, merge, release e deploy.

Não deve executar longos lotes de código.

### Engenharia da Plataforma

Responsável por:

- kernels;
- API Gateway;
- autenticação;
- autorização;
- auditoria;
- storage;
- workers;
- testes e CI.

### Portal unificado

Responsável por:

- experiência dos usuários;
- módulos e visões;
- acessibilidade;
- projeções;
- telas;
- integração Chat + Portal.

### Operações e integrações

Responsável por:

- clientes;
- WhatsApp;
- Meta;
- VNNOX;
- mídia;
- financeiro;
- site;
- infraestrutura e automações reais.

### Consolidação e qualidade

Responsável por:

- comparar branches;
- identificar supersessões;
- preparar PRs;
- executar testes integrados;
- estabilizar CIs;
- atualizar documentos canônicos;
- medir prontidão real.

## 2. Limite de trabalho simultâneo

No máximo:

- 1 frente mestre;
- 2 frentes técnicas ativas;
- 1 frente de consolidação.

Uma nova frente só deve abrir quando outra for encerrada, pausada ou incorporada.

## 3. Estado obrigatório de cada frente

Cada chat deve manter:

| Campo | Obrigatório |
|---|---|
| objetivo | sim |
| branch base | sim |
| branch de trabalho | sim |
| HEAD inicial | sim |
| entregas | sim |
| testes e CI | sim |
| bloqueios | sim |
| próximo passo | sim |
| percentual da frente | sim |
| impacto no percentual global | sim |
| status de consolidação | sim |

## 4. Estados padronizados

- `planejada`
- `em execução`
- `validada isoladamente`
- `pronta para consolidar`
- `consolidada`
- `bloqueada`
- `supersedida`

“CI verde” não significa “consolidada”.

## 5. Regra de handoff

Ao evoluir um chat, o texto de continuidade deve registrar:

1. definições canônicas relevantes;
2. HEAD compartilhado verificado;
3. branches e SHAs da frente;
4. arquivos e contratos alterados;
5. testes e workflows;
6. o que ainda não está consolidado;
7. o único próximo objetivo.

## 6. Regra de percentuais

Cada chat informa dois números:

- **percentual da frente**;
- **impacto no programa global**.

Nenhum chat especializado pode atualizar sozinho o percentual institucional global sem cruzar:

- integração na foundation;
- CI global;
- operação ponta a ponta;
- evidência de produção ou ambiente equivalente.

## 7. Próxima ação

Criar uma matriz versionada de branches e capacidades, marcando:

- incorporada;
- parcialmente incorporada;
- isolada;
- supersedida;
- aguardando validação.
