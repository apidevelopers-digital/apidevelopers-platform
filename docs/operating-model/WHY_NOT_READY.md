# WHY NOT READY — API DEVELOPERS.DIGITAL

**Atualizado em:** 2026-07-19  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo:** venda 100% automática  
**Merge:** não autorizado  
**Deploy:** não autorizado  

## 1. Estado atual

A plataforma possui avanço consistente em Foundation e Platform Core, com trabalho versionado para:

- `tenant-core`;
- `user-core`;
- `project-core`;
- contratos e workflows segmentados;
- documentação de continuidade;
- modelo operacional e blueprint da empresa digital.

O HEAD atual da branch inclui:

- `feat(project-core): adiciona manifesto do domínio de projetos`;
- `docs(project-core): documenta fronteiras e eventos`;
- `ci(project-core): adiciona validação segmentada`;
- `feat(project-core): implementa ciclo de vida e repositório`;
- `test(project-core): cobre tenant slug e ciclo de vida`.

## 2. Bloqueio operacional imediato

Os workflows mais recentes permanecem aguardando o self-hosted runner.

Esse bloqueio impede confirmar CI verde no HEAD atual, mas não constitui evidência de falha de código.

Condição para remover este bloqueio:

1. runner registrado em `sitedauni/apidevelopers-platform`;
2. labels compatíveis com `[self-hosted, macOS, X64]`;
3. estado `Online / Idle`;
4. workflows do HEAD concluídos;
5. evidência dos resultados registrada.

## 3. Bloqueadores do Gate 2 — Platform Core

O Gate 2 ainda não pode ser marcado como concluído porque faltam evidências consolidadas para:

- persistência real de Tenant, User, Project e API Key;
- migrations reproduzíveis;
- API Keys persistentes, revogáveis e rotacionáveis;
- auditoria persistente;
- integração oficial dos contratos do Core com o API Gateway;
- testes de contrato e integração cobrindo fluxos válidos e inválidos;
- CI verde no commit consolidado;
- documentação canônica atualizada com o estado real.

## 4. Bloqueadores da venda 100% automática

Mesmo após concluir o Gate 2, o lançamento comercial permanece bloqueado enquanto o cliente não puder, sem intervenção humana:

1. descobrir o produto;
2. criar e verificar a conta;
3. selecionar um plano;
4. pagar;
5. receber tenant e projeto;
6. gerar e revogar API Key;
7. acessar documentação e exemplos;
8. acompanhar uso e limites;
9. alterar plano;
10. cancelar;
11. receber faturamento e notificações;
12. obter suporte e recuperação de conta.

Internamente, também precisam ser automáticos:

- provisioning;
- billing e reconciliação;
- suspensão e reativação;
- aplicação de limites;
- auditoria;
- monitoramento;
- notificações;
- tratamento de falhas;
- rollback operacional;
- atualização do estado comercial.

## 5. Bloqueadores de produto e negócio

Ainda precisam ser consolidados:

- catálogo comercial oficial;
- planos e pricing;
- Capability Registry;
- matriz de automação;
- jornada completa do cliente;
- critérios de `READY_FOR_SALE`;
- política de trial, upgrade, downgrade e cancelamento;
- suporte e SLA;
- termos, privacidade e requisitos regulatórios aplicáveis;
- métricas de ativação, conversão, retenção, consumo e receita.

## 6. Bloqueadores de segurança e operação

Antes do lançamento devem existir evidências para:

- isolamento entre tenants;
- gestão segura de segredos;
- autorização e permissões;
- rate limits e quotas;
- logs e auditoria sem exposição de dados sensíveis;
- backup e restauração;
- monitoramento e alertas;
- resposta a incidentes;
- rotação e revogação de chaves;
- runbooks de falha, rollback e indisponibilidade;
- proteção contra abuso e consumo indevido.

## 7. O que não bloqueia o trabalho agora

Enquanto o runner estiver indisponível, podem continuar sem merge ou deploy:

- documentação de produto e governança;
- Capability Registry;
- matriz de automação;
- definição de contratos;
- testes locais;
- revisão arquitetural;
- preparação de migrations;
- preparação do Gateway;
- critérios de venda e lançamento.

Não devem ser promovidos como concluídos sem CI e evidência remota.

## 8. Critério de remoção deste documento

Este arquivo deve ser reduzido conforme cada bloqueador for eliminado.

A plataforma somente poderá ser declarada pronta para venda quando:

- todos os gates obrigatórios estiverem concluídos;
- a jornada comercial funcionar de ponta a ponta sem intervenção humana;
- as operações internas críticas forem automáticas;
- segurança, billing, suporte e observabilidade tiverem evidências;
- `READY_FOR_SALE.md` estiver integralmente satisfeito;
- houver autorização explícita para o próximo estado.

## 9. Próximo passo permitido

1. restaurar o self-hosted runner;
2. concluir os workflows do HEAD;
3. consolidar o estado do Gate 2;
4. avançar persistência, migrations, API Key e auditoria;
5. manter documentação e evidências sincronizadas.

## 10. Regra permanente

> Ausência de falha não significa prontidão. Prontidão exige jornada completa, automação, segurança, operação, evidência e autorização.
