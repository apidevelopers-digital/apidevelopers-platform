# Snapshot canônico de continuidade — Portal

**Data:** 2026-07-20  
**Status:** PREPARADO_PARA_CONTINUIDADE  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Fonte de verdade:** Git

## Estado retomado

- `KNOWLEDGE_GRAPH_MODEL.md` concluído.
- `PORTAL_DATA_MODEL.md` contém `SourceRef`, `Node`, `Relation`, `Evidence`, `StateSnapshot`, `Iteration`, `Approval` e `AuditEvent`.
- SHA informado na retomada: `fa09813471c48c810674d0ec8c17f97281536527`.
- HEAD observado antes desta sequência: `a25555816c590795be8a9752cf1cbbbf790b17b8`.
- O avanço intermediário pertencia à frente `activation-core` e foi preservado.

## Microcommits desta sequência

1. `64d44d433a64fc6677b29513bb8ded81fa5f564c` — índice modular em `docs/architecture/portal/README.md`.
2. `8ac20d95015b73ec6dfe6057deaa33abba43b3fb` — contrato de projeções em `PROJECTIONS.md`.
3. `2b6bc0eb9121f0d4a9760090293b6b95a43f4b5e` — reconciliação em `RECONCILIATION.md`.
4. `9a8a749ae89807a191641ffb7919f32e51ad1601` — contrato inicial da API em `API_MODEL.md`.
5. `cf31b870f53fb7d09d306abe358869bc2bd8553d` — critérios de prontidão em `READINESS.md`.

## Arquitetura resultante

```text
docs/architecture/
├── PORTAL_DATA_MODEL.md
└── portal/
    ├── README.md
    ├── PROJECTIONS.md
    ├── RECONCILIATION.md
    ├── API_MODEL.md
    └── READINESS.md
```

## Decisões preservadas

- Git é fonte de verdade e memória institucional.
- Portal é camada derivada de governança e visualização.
- Projeções são reconstruíveis, rastreáveis e descartáveis.
- Reconciliação privilegia o Git e não realiza merge semântico automático.
- API deve expor commit, projeção e estado de reconciliação.
- Prontidão é baseada em evidência e não autoriza deploy.
- Merge, release, deploy e produção permanecem bloqueados sem autorização explícita.

## Pendência documental

Adicionar no fim de `docs/architecture/PORTAL_DATA_MODEL.md` apenas um índice de links para os cinco módulos. Nenhum objeto do modelo precisa ser reescrito.

## Próximo passo permitido

1. Inserir o índice modular no documento raiz.
2. Validar links internos e estrutura Markdown.
3. Avaliar a fundação documental para `structurally_ready`.
4. Planejar implementação do projetor sem merge, release ou deploy.

## Progresso

- Fundação documental: aproximadamente 98%.
- Projeto completo: aproximadamente 49%.

## Segurança

Nenhum merge, release, deploy, workflow, publicação ou alteração em produção foi executado.
