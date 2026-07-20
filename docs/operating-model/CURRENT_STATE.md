# CURRENT STATE

**Status:** Canônico  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**HEAD conferido:** `c31b14e7982b7cd8b2601aa34b01746cbfcc1667a

## Estado operacional

- Produção ativa em duas janelas.
- Runner self-hosted operacional.
- GitHub Actions voltou a executar.
- `main` preservada.
- Merge, release e deploy dependem de autorização explícita.
- Git é a memória institucional e a fonte de verdade.
- O Portal será camada de leitura, governança e operação, nunca fonte paralela.

## Janela de engenharia

Responsável por:

- manifests;
- implementação;
- documentação técnica;
- testes;
- CI segmentada;
- evidências por domínio.

Avanços mais recentes conferidos:

- `plan-core`;
- `entitlement-core`;
- testes e CI segmentada desses domínios.

## Janela de produto, arquitetura e governança

Responsável por:

- modelo operacional;
- continuidade;
- índice-mestre;
- registro de capacidades;
- modelo de entidades;
- relações institucionais;
- modelo de dados do Portal;
- critérios de prontidão e promoção.

Entregas canônicas já registradas:

- `COMPANY_OPERATING_SYSTEM.md`;
- `EXECUTIVE_DASHBOARD.md`;
- `CONVERSATION_CONTINUITY_PROTOCOL.md`;
- `DIGITAL_COMPANY_BLUEPRINT.md`;
- `WHY_NOT_READY.md`;
- `PLATFORM_CAPABILITY_REGISTRY.md`;
- `COMPANY_WORLD_INDEX.md`.

## Método de produção

1. Conferir o índice-mestre.
2. Conferir este estado atual.
3. Conferir a próxima iteração.
4. Conferir o HEAD real da branch.
5. Evitar duplicidade e conflito entre janelas.
6. Trabalhar em lote pequeno.
7. Preferir patch pontual a reescrita integral.
8. Fazer commit pequeno e temático.
9. Validar por testes e CI.
10. Registrar evidência, estado e próximo passo.

## Próximo marco

1. Atualizar `NEXT_ITERATION.md`.
2. Criar o guia universal de trabalho para IA e colaboradores.
3. Registrar `plan-core` e `entitlement-core` no Capability Registry.
4. Criar `ENTITY_REGISTRY_SPEC.md`.
5. Depois seguir para `KNOWLEDGE_GRAPH_MODEL.md`.
6. Somente então definir `PORTAL_DATA_MODEL.md`.

## Regra de continuidade

> Conversa é sessão de trabalho. Git é menória institucional. CI valida. Portal governa. Automação executa.
