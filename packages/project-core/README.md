# @apidevelopers/project-core

Domínio canônico de projetos pertencentes a um tenant.

## Responsabilidades

- identidade e ciclo de vida de projetos;
- slug único dentro do tenant;
- vínculo obrigatório com `tenantId`;
- estados `provisioning`, `active`, `suspended`, `archived` e `deleted`;
- contrato substituível de repositório;
- eventos de domínio;
- política injetável para validar o tenant antes da criação.

## Fronteiras

- `tenant-core` é dono do ciclo de vida do tenant;
- `tenancy` é dono do isolamento e membership;
- `apikey-core` é dono do segredo e da revogação de chaves;
- `project-core` é dono da entidade à qual chaves, uso e APIs são vinculados.

## Eventos

- `project.created`
- `project.activated`
- `project.suspended`
- `project.archived`
- `project.reactivated`
- `project.restored`
- `project.deleted`

## Validação

```bash
npm --prefix packages/project-core run check
```
