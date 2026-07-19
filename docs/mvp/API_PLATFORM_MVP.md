# API Developers.digital — MVP da plataforma

## Escopo implementado

O MVP é composto por:

1. `apps/api-gateway`: servidor HTTP sem dependências externas, catálogo público e OpenAPI 3.1;
2. autenticação por API Key em `x-api-key` ou `Authorization: ApiKey`;
3. cadastro e listagem administrativa de clientes;
4. emissão de chaves com armazenamento apenas do hash;
5. `apps/developer-portal`: portal estático com área do desenvolvedor, OpenAPI e painel administrativo;
6. testes unitários e teste real do servidor HTTP;
7. workflow dedicado `API Gateway MVP CI`.

## Contratos de acesso

| Rota | Política |
|---|---|
| `/health`, `/v1`, `/v1/apis`, `/openapi.json` | pública |
| `/v1/me` | chave de cliente ou administrativa |
| `/v1/admin/clients` | somente chave administrativa |

## Configuração

- `API_GATEWAY_ADMIN_KEY`: segredo administrativo injetado no runtime.
- `API_GATEWAY_CLIENTS_JSON`: clientes iniciais, preferencialmente com `apiKeyHash`.
- `HOST`: endereço de bind, padrão `127.0.0.1`.
- `PORT`: porta HTTP, padrão `3000`.

Nenhuma credencial real está versionada.

## Limites deliberados do MVP

- armazenamento de clientes em memória;
- sem banco de dados;
- sem rotação/revogação via endpoint;
- sem rate limiting distribuído;
- sem deploy, domínio ou ambiente remoto;
- portal servido separadamente como conteúdo estático;
- nenhuma integração com dados reais.

## Próxima evolução recomendada

O próximo lote deve introduzir uma interface de repositório persistente, migrações, rotação/revogação de chaves, auditoria administrativa, rate limiting e empacotamento do portal pelo gateway.

## Gates

Este lote autoriza somente código e CI na branch de foundation. Merge, release e deploy continuam fora do escopo.
