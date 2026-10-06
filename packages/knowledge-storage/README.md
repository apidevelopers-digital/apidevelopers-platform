# @apidevelopers/knowledge-storage

Slice inicial do **Knowledge Storage institucional**.

## Papel

Este pacote implementa somente o **planejamento governado de Intake**. Ele não copia livros, não grava conteúdo, não cria embeddings e não altera storage produtivo.

O contrato segue os documentos atuais da instituição:

- `apidevelopers-institution/docs/KNOWLEDGE_STORAGE_OPERATING_MODEL.md`
- `apidevelopers-institution/docs/KNOWLEDGE_STORAGE_INGESTION_POLICY.md`

E integra-se conceitualmente aos kernels já existentes:

- `@apidevelopers/kernel-retrieval` para busca federada e proveniência;
- `@apidevelopers/kernel-evidence` para evidência/digest e auditoria.

## Arquitetura

```text
Brain institucional (VPS)
        |
        | governa / orquestra
        v
Knowledge Intake v1 (este pacote)
        |
        | plano aprovado no futuro
        v
Mac storage primary <-> Mac storage replica
        |
        | AI Work: extração / chunks / índices
        v
kernel-retrieval
        |
        +--> ChefSapiens
        +--> outros consumidores autorizados
```

O MySQL pode manter metadados operacionais e referências, mas este slice **não autoriza conteúdo bruto de livros no banco**.

## Gate

A função `createKnowledgeIntakePlan()`:

1. exige os metadados mínimos da política;
2. valida status de licença e uso permitido;
3. exige SHA-256 e tamanho do artefato sem receber os bytes;
4. bloqueia full text quando licença/risco não permitem;
5. falha fechada para risco sensível alto;
6. produz somente um plano `dry_run_only`;
7. exige revisão humana antes de qualquer armazenamento real.

Constante institucional neste slice:

```text
REAL_INGESTION_ENABLED=false
```

## “Quebra-gelo”

O primeiro livro piloto deve passar por este gate antes de qualquer cópia para os Macs. O piloto prova:

- metadados;
- licença;
- classificação;
- SHA-256;
- política de uso;
- plano primary/replica;
- integração futura com retrieval/evidence.

Nenhum arquivo real é ingerido por este pacote.

## Verificação

```bash
npm run check
```
