# NEXT ITERATION — API DEVELOPERS.DIGITAL

**Atualizado em:** 2026-07-19  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo:** venda 100% automática  
**Merge:** não autorizado  
**Deploy:** não autorizado

## Prioridade executiva

Fechar o **Gate 2 — Platform Core** antes de ampliar funcionalidades secundárias.

## Escopo obrigatório da próxima iteração

1. Implementar `tenant-core`.
2. Implementar `user-core`.
3. Implementar `project-core`.
4. Definir interfaces de persistência para Tenant, User, Project e API Key.
5. Adicionar adapters persistentes e migrations.
6. Implementar auditoria persistente.
7. Integrar os contratos do Core ao API Gateway.
8. Criar testes unitários, de contrato e integração.
9. Consolidar um único commit funcional por lote.
10. Confirmar CI verde no commit consolidado.

## Critérios de conclusão do Gate 2

O Gate 2 somente poderá ser marcado como concluído quando:

- Tenant, User e Project possuírem identidade, estado e regras de domínio;
- dados críticos sobreviverem ao reinício dos processos;
- API Keys forem persistentes, revogáveis e rotacionáveis;
- o Gateway consumir contratos oficiais do Core;
- auditoria registrar ações relevantes;
- migrations puderem ser aplicadas de forma reproduzível;
- testes cobrirem fluxos válidos e inválidos;
- CI estiver verde;
- documentação canônica refletir o estado real.

## Fora de escopo nesta iteração

- marketplace;
- SDK mobile;
- multi-região;
- white-label avançado;
- expansão visual do Portal sem dependência do Core;
- release público;
- merge em `main`;
- deploy em produção.

## Coordenação entre janelas

### Frente de engenharia

Responsável por código, testes, CI, Gateway, Core, persistência e integrações técnicas.

### Frente de produto e governança

Responsável por catálogo, capacidades, jornada automática, critérios de venda, dashboard, riscos e continuidade documental.

As duas frentes não devem editar o mesmo arquivo simultaneamente sem coordenação explícita.

## Próximo documento após esta iteração

`docs/operating-model/WHY_NOT_READY.md`

Ele deverá listar apenas bloqueadores objetivos para a venda automática e ser reduzido conforme os gates forem concluídos.

## Regra permanente

Nenhuma decisão importante deve permanecer apenas em conversa.  
Toda mudança relevante precisa terminar com:

1. implementação ou decisão registrada;
2. testes ou evidências;
3. documento atualizado;
4. commit descritivo;
5. próximo passo definido.
