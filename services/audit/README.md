# @apidevelopers/audit

Serviço canônico de auditoria da API Developers.digital.

## Responsabilidades

- registrar acões de usuários, contas de serviço e processos automatizados;
- preservar evidências imutáveis;
- associar cada registro ao tenant, principal, request e correlation;
- suportar retenção, exportação e consulta por permissões.

## Campos mínimos

- `audit_id`
- `tenant_id`
- `principal_id`
- `request_id`
- `correlation_id`
- `action`
- `resource`
- `result`
- `timestamp`

## Regras

1. Registros de auditoria são imutáveis.
2. Nenhum segredo é armazenado.
3. Toda operação sensível deve gerar evidência.
4. Consultas respeitam isolamento por tenant.

## Status

Foundation v1 em implementação.
