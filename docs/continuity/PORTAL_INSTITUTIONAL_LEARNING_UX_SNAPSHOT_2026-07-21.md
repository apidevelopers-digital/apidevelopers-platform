# Snapshot de continuidade — Portal Institucional + Aprendizado UX

**Data:** 2026-07-21  
**Status:** LOTE_DOCUMENTAL_CONCLUÍDO_NA_BRANCH_TÉCNICA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch do lote:** `work/portal-institutional-ux-spec-20260720`  
**Base reancorada:** `a0e7427ba181c8012e9f56a574a376f980ed51c3`

## 1. Finalidade

Registrar a especificação UX v1 do primeiro Portal Institucional integrado ao Portal de Aprendizado, preservando os contratos somente leitura e a arquitetura derivada já existentes.

## 2. Caminhos reservados

- `docs/product/portal-institutional/README.md`
- `docs/continuity/PORTAL_INSTITUTIONAL_LEARNING_UX_SNAPSHOT_2026-07-21.md`

Nenhum arquivo de código, workflow, persistência, outbox, gateway, projetor ou Rule Engine faz parte deste lote.

## 3. Decisões consolidadas

A primeira tela é a **Visão Institucional**, composta por:

- cabeçalho de contexto, versão e atualização;
- selo persistente `Somente leitura`;
- resumo institucional;
- indicadores de registros, módulos, versões e integridade;
- painel de origem e rastreabilidade;
- seção Aprendizado integrada;
- memórias e achados recentes;
- propostas pendentes com selo `Não aprovada`;
- evidências;
- estados explícitos de erro, vazio, bloqueio, ausência de permissão e defasagem.

## 4. Navegação v1

- Visão Geral
- Registros
- Módulos
- Aprendizado
- Rastreabilidade

A navegação nunca autoriza troca ou cruzamento de tenants fora das políticas existentes.

## 5. Contratos visuais

Foi definido um envelope comum somente leitura com:

- `readOnly: true`;
- geração e versão da projeção;
- versão do contrato;
- origem e projetor;
- condição de defasagem;
- acesso permitido, negado ou bloqueado por política;
- erro estável e recuperabilidade;
- ID de correlação quando permitido.

Foram definidos modelos visuais para snapshot institucional, aprendizado, propostas e evidências. A implementação deverá mapear esses modelos aos payloads reais da API sem criar persistência paralela.

## 6. Estados obrigatórios

- carregando;
- vazio legítimo;
- erro recuperável ou definitivo;
- bloqueado por política;
- sem permissão;
- somente leitura;
- dados potencialmente desatualizados.

Erro de política não pode ser tratado como vazio e ausência de permissão não pode revelar a existência de objetos protegidos.

## 7. Invariantes preservados

- Portal não é fonte de verdade;
- Portal não acessa banco, broker ou provider;
- Portal não armazena credenciais;
- Portal não cruza tenants;
- Portal não decide, aprova ou executa;
- Portal não introduz mutação na v1;
- propostas exigem aprovação humana;
- toda ação futura passa pelo Gateway, autenticação, autorização, domínio, persistência/outbox e auditoria.

## 8. Plano de implementação

1. alinhar contratos HTTP reais;
2. criar shell, navegação e estados globais;
3. implementar Visão Institucional;
4. integrar Aprendizado;
5. adicionar rastreabilidade, acessibilidade e robustez;
6. endurecer com testes de contrato, política e isolamento.

## 9. Próximo estado permitido

Iniciar a implementação visual somente após:

- confirmação do local canônico do aplicativo;
- validação dos contratos reais Institutional e Learning;
- definição da autenticação da interface;
- revisão dos critérios de defasagem e exposição de evidências.

Sem deploy, release, publicação externa ou mutação automática.
