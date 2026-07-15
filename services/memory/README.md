# @apidevelopers/memory

Serviço canônico de memória da API Developers.digital.

## Responsabilidades

- armazenar memórias estruturadas e não estruturadas;
- controlar retenção, versionamento e revogação;
- permitir classificação por tipo, responsável e risco;
- suportar busca, auditoria e isolamento por tenant.

## Regras

1. Toda memória possui tenant_id.
2. Memórias sensíveis permitem políticas de aprovação.
3. Toda alteração gera evento e auditoria.
4. Revogação preserva histórico.

## Contratos iniciais

- MemoryRecord
- MemoryRef
- MemoryPolicy
- MemoryQuery

## Status

Foundation v1 em implementação.
