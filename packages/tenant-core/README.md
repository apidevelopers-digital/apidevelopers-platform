# @apidevelopers/tenant-core

Domínio canônico de identidade e ciclo de vida de tenants da API Developers.digital.

## Responsabilidades

- criar a entidade `Tenant`;
- normalizar e proteger slugs;
- controlar estados `provisioning`, `active`, `restricted`, `suspended` e `cancelled`;
- validar transições de ciclo de vida;
- emitir resultados com eventos de domínio;
- definir um contrato substituível de repositório;
- oferecer uma implementação em memória para testes e bootstrap.

## Limite com `@apidevelopers/tenancy`

`tenant-core` é dono da entidade e do ciclo de vida do tenant.

`tenancy` continua responsável por:

- contexto tenant da requisição;
- membership;
- permissões;
- isolamento contra acesso cruzado;
- ownership de recursos.

Os pacotes são complementares. Nenhum deles deve absorver a responsabilidade do outro.

## API principal

```js
import {
  createMemoryTenantRepository,
  createTenantService,
} from "@apidevelopers/tenant-core";

const service = createTenantService({
  repository: createMemoryTenantRepository(),
  idFactory: () => crypto.randomUUID(),
});

const { tenant } = service.provisionTenant({
  name: "Empresa Exemplo",
  ownerUserId: "user-123",
});

service.activateTenant(tenant.id);
```

## Repositório

Um adaptador precisa implementar:

- `create(tenant)`
- `getById(tenantId)`
- `getBySlug(slug)`
- `list(filters)`
- `replace(tenant)`

Persistência externa, migrações e transações serão implementadas por adaptadores próprios.

## Eventos retornados

- `tenant.provisioned`
- `tenant.activated`
- `tenant.restricted`
- `tenant.suspended`
- `tenant.cancelled`
- `tenant.reactivated`

O pacote retorna eventos; publicação em outbox ou event bus pertence à camada de aplicação.

## Validação

```bash
npm --prefix packages/tenant-core run check
```
