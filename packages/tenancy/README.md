# @apidevelopers/tenancy

Pacote canônico de organizações, tenants e isolamento de dados da API Developers.digital.

## Responsabilidades

- representar organizações, tenants, workspaces e memberships;
- definir o contexto tenant de cada requisição;
- isolar dados, memória, conexões, eventos e auditoria;
- definir ownership de canais, credenciais, assets e integrações;
- suportar hierarquias sem cruzamento indevido de dados.

## Entidades iniciais

- `Organization`
- `Tenant`
- `Workspace`
- `Membership`
- `RoleBinding`
- `ConnectionOwnership`
- `TenantContext`

## Regras permanentes

1. `tenant_id` é opaco e não contém dado pessoal.
2. Rotas privadas exigem `tenant_id` validado.
3. Identidade autenticada não define tenant automaticamente.
4. Membership e permissões são verificadas antes da operação.
5. Dados, memória, arquivos, eventos e credenciais não atravessam tenants.
6. Conexões de provedores pertencem ao tenant que as cadastrou.
7. Operações globais exigem permissão especial e auditoria.
8. Produtos internos não são tenants privilegiados.

## Critérios de conclusão

- testes de acesso cruzado falham por padrão;
- tenant é obrigatório em rotas privadas;
- conexões e credenciais possuem ownership explícito;
- auditoria registra tenant, principal e request.

## Status

Foundation v1 em implementação.
