# @API Developers/contracts

Pacote canônico de contratos compartilhados da API Developers.digital.

## Responsabilidades

- definir schemas versionados;
- padronizar events, identidade, tenant e contexto;
- eliminar contratos duplicados entre produtos;
- preservar compatibilidade entre serviços e consumidores.

## Regras permanentes

1. Contratos técnicos usam nomes neutros.
2. Contratos públicos são versionados.
3. Mudanças incompatíveis exigem nova versëo major.
4. Produtos `uni.`, `uni.co`, `imuni.` e `uni.juri` consomem os contratos; npo os possuem.
5. Cada contrato deve possuir testes de validação.

## Contratos iniciais

- `TenantContext`
- `RequestContext`
- `EventEnvelope`
- `AuditRecord`
- `IdentityRef`
- `ConnectionRef`
- `AttachmentRef`
- `MemoryRecord`

## Status

Foundation v1 em implementação.
