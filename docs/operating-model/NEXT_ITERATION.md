# NEXT ITERATION — API DEVELOPERS.DIGITAL

**Atualizado em:** 2026-07-20  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo:** consolidar o sistema operacional, o mapa institucional e os registros canônicos da empresa  
**Merge:** não autorizado  
**Deploy:** não autorizado

## Prioridade executiva

Fechar a base de continuidade e orientação universal antes de ampliar novas camadas do Portal.

## Escopo obrigatório desta iteração

1. manter `COMPANY_WORLD_INDEX.md` como ponto de entrada universal;
2. manter `CURRENT_STATE.md` como estado factual da produção;
3. criar `AI_WORK_GUIDE.md` para orientar qualquer IA ou colaborador;
4. atualizar `PLATFORM_CAPABILITY_REGISTRY.md` com os domínios implementados;
5. criar `ENTITY_REGISTRY_SPEC.md`;
6. criar `KNOWLEDGE_GRAPH_MODEL.md`;
7. somente depois criar `PORTAL_DATA_MODEL.md`.

## Critérios de conclusão

Esta iteração termina quando:

- uma nova janela consegue descobrir onde começar sem depender da conversa anterior;
- toda área possui fonte canônica identificada;
- o estado atual e o próximo passo estão explícitos;
- o guia universal descreve método, identidade, limites e fluxo de trabalho;
- capacidades e entidades possuem identificadores estáveis;
- o Portal permanece camada de leitura e governança, sem fonte paralela;
- as duas janelas trabalham sem editar o mesmo arquivo simultaneamente;
- cada lote termina com commit pequeno, validação, evidência e atualização de estado.

## Coordenação entre janelas

### Frente de engenharia

Responsável por:

- manifests;
- implementação;
- documentação técnica;
- testes;
- CI segmentada;
- evidências por domínio.

### Frente de produto, arquitetura e governança

Responsável por:
- índice-mestre;
- continuidade;
- registros canônicos;
- crítérios de prontidão;
- modelo de entidades;
- relações institucionais;
- modelo futuro do Portal.

Antes de escrever, cada janela deve conferir o HEAD e evitar o arquivo que a outra frente esteja modificando.

## Método de produção

```text
conferência
→ lote pequeno
→ validação
→ commit temático
→ CI
→ evidência
→ atualização do estado
```

Arquivos grandes devem ser alterados por patch pontual. Publicações devem validar conteúdo e codificação antes da escrita e conferir o resultado depois.

## Fora de escopo nesta iteração

- merge em `main`;
- release público;
- deploy em produção;
- marketplace;
- SDK mobile;
- multi-região;
- expansão visual do Portal antes do modelo de dados;
- criação de fonte de verdade fora do Git.

## Próximo documento

`docs/company/AI_WORK_GUIDE.md`

## Regra permanente

Nenhuma decisão importante deve permanecer apenas em conversa.

Toda mudança relevante precisa terminar com:

1. decisão ou implementação registrada;
2. validação ou evidência;
3. commit descritivo;
4. estado atualizado;
5. próximo passo definido.

Merge, release, deploy e ações sensíveis exigem autorização explícita.
