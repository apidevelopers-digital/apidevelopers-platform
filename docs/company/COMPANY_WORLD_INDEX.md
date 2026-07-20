# COMPANY WORLD INDEX

**Status:** Canônico  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`

## 1. Propósito

Este é o índice-mestre da empresa. Toda nova janela de trabalho, inteligência artificial, funcionário ou automação deve começar por aqui.

Este documento não substitui as fontes canônicas. Ele localiza cada fonte de verdade, mostra sua autoridade, estado e relação com o restante da empresa.

## 2. Regras universais

- Git é memória institucional e fonte de verdade.
- Conversas são sessões de trabalho, não memória definitiva.
- O Portal governa e visualiza; não cria uma fonte paralela.
- Toda mudança deve ser pequena, rastriável e validável.
- Commits devem ser pequenos e temáticos.
- Nenhuma capacidade é oficial sem registro canônico.
- Código sem teste e CI não está validado.
- Toda sessão termina com estado, evidência e próximo passo.
- Merge, release, deploy e alterações sensíveis exigem autorização explícita.

## 3. Ordem obrigatória de leitura

1. `docs/company/COMPANY_WORLD_INDEX.md`
2. `docs/operating-model/CURRENT_STATE.md`
3. `docs/operating-model/NEXT_ITERATION.md`
4. Documento canônico da área de trabalho
5. HEAD real da branch
6. CI e evidências do domínio

## 4. Mapa institucional

| Continente | Fonte canônica | Função |
|---|---|---|
| Operação | `docs/operating-model/COMPANY_OPERATING_SYSTEM.md` | Como a empresa opera |
| Continuidade | `docs/operating-model/CONVERSATION_CONTINUITY_PROTOCOL.md` | Como iniciar, retomar e encerrar sessões |
| Estado | `docs/operating-model/CURRENT_STATE.md` | Situação factual atual |
| Próxima iteração | `docs/operating-model/NEXT_ITERATION.md` | Próximo trabalho autorizado |
| Estratégia digital | `docs/operating-model/DIGITAL_COMPANY_BLUEPRINT.md` | Visão macro da empresa digital |
| Prontidão | `docs/operating-model/WHY_NOT_READY.md` | Bloqueadores objetivos |
| Capacidades | `docs/product/PLATFORM_CAPABILITY_REGISTRY.md` | O que a plataforma sabe fazer |
| Entidades | `docs/product/ENTITY_REGISTRY_SPEC.md` | Entidades oficiais e seus contratos |
| Relações | `docs/architecture/KNOWLEDGE_GRAPH_MODEL.md` | Como tudo se relaciona |
| Portal | `docs/product/PORTAL_DATA_MODEL.md` | Como o Portal lê e apresenta o Git |
| Engenharia | `packages/`, `services/`, `scripts/`, `.github/workflows/` | Implementação, testes e CI |

## 5. Hierarquia do mapa

```text
Empresa
→ Área
→ Produto
→ Plataforma
→ Domínio
→ Capacidade
→ Entidade
→ API ou componente
→ Código
→ Teste
→ CI
→ Release
→ Operação
```

Toda mudança deve poder ser rastreada no sentido inverso até a estratégia da empresa.

## 6. Produção em múltiplas janelas

### Janela de engenharia

Responsável por:
- manifests;
- implementação;
- documentação técnica;
- testes;
- CI segmentada;
- evidências do domínio.

### Janela de produto, arquitetura e governança

Responsável por:
- registros canônicos;
- continuidade;
- modelo de entidades;
- relações;
- critérios de prontidão;
- modelo do Portal;
- governança de promoção.

Antes de escrever, toda janela deve conferir o HEAD e evitar editar o mesmo arquivo que outra janela esteja modificando.

## 7. Método de produção

```text
conferência
→ lote pequeno
→ validação
→ commit temático
→ CI
→ evidência
→ atualização do estado
```

Arquivos grandes devem ser alterados por patch pontual. Publicações devem usar validação de conteúdo, Base64 round-trip quando aplicável e conferência pós-publicação.

## 8. Estado do mapa

### Existentes

- modelo operacional;
- protocolo de continuidade;
- painel executivo;
- blueprint digital;
- critérios de não prontidão;
- registro de capacidades.

### Próximos marcos

1. `CURRENT_STATE.md`
2. atualização de `NEXT_ITERATION.md`
3. `AI_WORK_GUIDE.md`
4. `ENTITY_REGISTRY_SPEC.md`
5. `KNOWLEDGE_GRAPH_MODEL.md`
6. `PORTAL_DATA_MODEL.md`

## 9. Regra de autoridade

Quando dois documentos parecerem contraditórios:

1. prevalece o documento canônico da área;
2. prevalece a versão mais recente validada no Git;
3. o conflito deve ser registrado e resolvido;
4. não se cria um terceiro documento duplicado para contornar o conflito.

## 10. Definição canônica

> O índice do mapa-múndi é o ponto de entrada universal da empresa. Ele localiza cada fonte de verdade, mostra suas relações, autoridade, estado e próximo passo, permitindo que qualquer agente continue a construção sem perder identidade, contexto ou método.
