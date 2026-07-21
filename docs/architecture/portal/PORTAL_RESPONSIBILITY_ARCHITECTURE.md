# Documento supersedido — não promover

**Status:** corrigido pela direção do Portal unificado  
**Branch:** `work/portal-operating-model-20260721`

## Motivo

A versão anterior ainda pressupunha vários portais especializados como superfícies administrativas independentes. A direção confirmada é:

- um Portal unificado;
- módulos e visões por perfil;
- tenants isolados;
- Chat + Portal para toda a equipe;
- serviços e APIs como executores reais;
- Git como fonte versionada;
- cofre externo para segredos.

## Separação que permanece válida

| Camada | Responsabilidade |
|---|---|
| ChatGPT | raciocinar, criar, desenvolver, atender e preparar |
| Git/GitHub | versionar código, documentação e mudanças |
| Portal unificado | administrar, autorizar, executar, acompanhar e auditar |
| Serviços e APIs | aplicar regras e operações reais |
| Cofre de segredos | proteger tokens, chaves e credenciais |
| Evidência | confirmar resultados verificáveis |

## Gate

- não promover a versão anterior;
- não criar autoridade por composição visual;
- não criar um novo portal administrativo quando uma visão do Portal unificado for suficiente;
- manter aprovação, execução e verificação como estados distintos.
