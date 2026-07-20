# Arquitetura modular do Portal

**Status:** canônico — estrutura inicial  
**Atualizado em:** 2026-07-20  
**Fonte de verdade:** Git  
**Documento raiz:** [`../PORTAL_DATA_MODEL.md`](../PORTAL_DATA_MODEL.md)

## 1. Finalidade

Este diretório divide a arquitetura do Portal em módulos pequenos, versionáveis e auditáveis.

O Portal é uma camada de governança, consulta e operação assistida. Ele não mantém uma verdade institucional paralela. Todo estado exibido deve ser derivável de conteúdo versionado no Git e deve carregar referência de origem.

## 2. Invariantes

1. Git é a fonte canônica e a memória institucional.
2. Projeções são reconstruíveis e descartáveis.
3. Toda entidade exposta possui `SourceRef`.
4. Estado validado exige evidência válida.
5. Divergências são exibidas e reconciliadas, nunca ocultadas.
6. Ações sensíveis exigem aprovação, auditoria e evidência.
7. O Portal não realiza merge, release, deploy ou publicação por consequência implícita.
8. Escritas devem produzir mudança governada no Git ou proposta rastreável de mudança.

## 3. Mapa dos módulos

| Módulo | Responsabilidade |
|---|---|
| [`PROJECTIONS.md`](PROJECTIONS.md) | Transformar fontes canônicas em modelos de leitura determinísticos |
| [`RECONCILIATION.md`](RECONCILIATION.md) | Detectar e tratar diferenças entre Git, projeções e superfícies do Portal |
| [`API_MODEL.md`](API_MODEL.md) | Definir recursos, contratos e semântica da API do Portal |
| [`READINESS.md`](READINESS.md) | Estabelecer critérios verificáveis de prontidão |

O modelo dos objetos fundamentais permanece em [`../PORTAL_DATA_MODEL.md`](../PORTAL_DATA_MODEL.md).

## 4. Fluxo de dados

```text
Git e documentos canônicos
  → extração
  → validação estrutural e semântica
  → grafo institucional derivado
  → projeções de leitura
  → API do Portal
  → interfaces e ações assistidas
```

A reconciliação acompanha todo o fluxo:

```text
origem canônica ↔ projeção ↔ API ↔ interface
```

## 5. Objetos compartilhados

Os módulos usam os objetos definidos no documento raiz:

- `SourceRef`
- `Node`
- `Relation`
- `Evidence`
- `StateSnapshot`
- `Iteration`
- `Approval`
- `AuditEvent`

Nenhum módulo pode redefinir esses objetos de forma incompatível. Extensões devem ser versionadas e manter compatibilidade explícita.

## 6. Regra de escrita

O Portal não atualiza diretamente projeções como se elas fossem registros canônicos.

Uma ação de escrita deve seguir uma destas rotas:

1. preparar uma proposta de alteração versionável;
2. registrar a autorização aplicável;
3. aplicar a alteração no Git por um gateway governado;
4. registrar `AuditEvent`;
5. reconstruir ou atualizar a projeção;
6. reconciliar o resultado com o commit produzido.

Caches, índices e bancos de leitura podem ser atualizados operacionalmente, mas continuam sendo derivados e reconstruíveis.

## 7. Versionamento

Cada módulo deve declarar mudanças incompatíveis no próprio histórico Git. Contratos de dados e API devem usar versão explícita.

Mudanças arquiteturais devem ser pequenas e temáticas. Documentos grandes devem ser expandidos por módulos, evitando concentração crescente no documento raiz.

## 8. Limites atuais

Esta arquitetura documental não declara:

- implementação de banco de dados;
- tecnologia de frontend;
- provider de autenticação;
- ambiente ativo;
- deploy realizado;
- release pronta;
- produção autorizada.

Esses estados exigem decisões, evidências e gates próprios.
