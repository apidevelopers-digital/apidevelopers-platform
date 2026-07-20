# Modelo de API do Portal

**Status:** canônico — contrato inicial  
**Fonte de verdade:** Git  
**Relacionados:** [`../PORTAL_DATA_MODEL.md`](../PORTAL_DATA_MODEL.md), [`PROJECTIONS.md`](PROJECTIONS.md)

## Princípio

A API expõe modelos derivados e ações governadas. Não é banco canônico independente. Toda resposta institucional deve informar o commit e a projeção usados.

## Prefixo

`/v1/portal`

Mudanças incompatíveis exigem nova versão.

## Metadados

```json
{
  "meta": {
    "apiVersion": "v1",
    "schemaVersion": "portal.node/v1",
    "sourceCommit": "<sha>",
    "projectionId": "PRJ-GRAPH-INDEX-0001",
    "projectionChecksum": "<sha256>",
    "generatedAt": "<timestamp>",
    "reconciliationStatus": "in_sync"
  },
  "data": {}
}
```

Respostas sem `sourceCommit` não são leituras canônicas.

## Recursos de leitura

- `GET /nodes`
- `GET /nodes/{id}`
- `GET /relations`
- `GET /evidence`
- `GET /state-snapshots`
- `GET /iterations`
- `GET /approvals`
- `GET /audit-events`
- `GET /projections`
- `GET /reconciliations`
- `GET /readiness`

Consultas usam filtros documentados, paginação por cursor e ordenação estável. Consultas fixadas a commit não misturam dados de outros commits.

## Consistência

A API deve expor `ETag`, commit servido, checksum da projeção e estado de reconciliação. Pode aceitar:

`X-Portal-Source-Commit: <sha>`

Se não puder servir exatamente o commit solicitado, retorna conflito ou indisponibilidade explícita.

## Ações governadas

- `POST /actions/prepare`
- `POST /actions/{id}/validate`
- `POST /actions/{id}/request-approval`
- `POST /actions/{id}/execute`
- `POST /actions/{id}/cancel`

`prepare` não executa. Validação não aprova. Execução exige aprovação válida, idempotência, auditoria e evidência observável. Escrita institucional deve resultar em mudança governada no Git ou proposta rastreável.

## Idempotência

Ações mutáveis aceitam `Idempotency-Key`. A mesma chave, ator, ação e escopo retornam o resultado original. Reutilização incompatível retorna conflito.

## Erros

```json
{
  "error": {
    "code": "PORTAL_SOURCE_COMMIT_MISMATCH",
    "message": "A projeção não corresponde ao commit solicitado.",
    "status": 409,
    "traceId": "<opaque-id>",
    "details": {}
  }
}
```

Códigos iniciais:

- `PORTAL_NOT_FOUND`
- `PORTAL_INVALID_QUERY`
- `PORTAL_SOURCE_COMMIT_MISMATCH`
- `PORTAL_PROJECTION_STALE`
- `PORTAL_RECONCILIATION_BLOCKED`
- `PORTAL_APPROVAL_REQUIRED`
- `PORTAL_APPROVAL_INVALID`
- `PORTAL_IDEMPOTENCY_CONFLICT`
- `PORTAL_FORBIDDEN`
- `PORTAL_UNAVAILABLE`

## Segurança e auditoria

Autorização é aplicada por recurso e ação. `tenant_id` é opaco e tenants não são combinados. Respostas e logs não expõem segredos. Toda tentativa sensível gera `AuditEvent`. Ler uma aprovação não concede autoridade para executar.

## Fora do escopo

Este contrato não escolhe provider de identidade, gateway, banco de leitura, SLA, ambiente ou autorização para deploy.
