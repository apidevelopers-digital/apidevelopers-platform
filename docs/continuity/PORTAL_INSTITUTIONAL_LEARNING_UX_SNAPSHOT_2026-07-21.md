# Snapshot de continuidade — Portal Institucional + Aprendizado UX

**Data:** 2026-07-21  
**Status:** LOTE_DOCUMENTAL_REANCORADO  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `work/portal-institutional-ux-spec-final-20260720`  
**Base:** `b9d68ce5821d7a5cb0f6732fe47bd091cfddaff9`

## Escopo

Foram reservados somente:

- `docs/product/portal-institutional/README.md`
- `docs/continuity/PORTAL_INSTITUTIONAL_LEARNING_UX_SNAPSHOT_2026-07-21.md`

Nenhum código, workflow, gateway, projetor, Rule Engine, persistência ou outbox foi alterado.

## Decisões

A primeira tela é a **Visão Institucional** com contexto, versão, atualização, selo `Somente leitura`, resumo, indicadores, integridade/origem e Aprendizado integrado.

A navegação v1 contém:

- Visão Geral
- Registros
- Módulos
- Aprendizado
- Rastreabilidade

Aprendizado exibe memórias, achados, propostas pendentes `Não aprovadas` e evidências. Aprovação humana é obrigatória e não existe ação de aprovação ou execução no Portal.

## Contratos e estados

O contrato visual preserva `readOnly`, geração, versão, origem, projetor, defasagem, acesso, erro e correlação. Os modelos visuais devem ser mapeados aos payloads reais da API de leitura.

Estados obrigatórios: carregando, vazio legítimo, erro, bloqueio por política, sem permissão, somente leitura e dados potencialmente desatualizados.

## Invariantes

O Portal não é fonte de verdade, não acessa infraestrutura, não armazena credenciais, não cruza tenants, não decide, não aprova, não executa e não introduz mutação na v1.

## Implementação futura

1. validar contratos HTTP;
2. criar shell e estados;
3. implementar Visão Institucional;
4. integrar Aprendizado;
5. adicionar rastreabilidade e acessibilidade;
6. endurecer com testes de contrato, política e isolamento.

Sem deploy, release ou publicação externa.
