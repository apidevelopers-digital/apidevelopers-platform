# @apidevelopers/auth-core

Contratos de autenticação e autorização da plataforma.

## Responsabilidades

- extrair API Key de `x-api-key`, `Authorization: ApiKey` ou `Bearer`;
- comparar o segredo administrativo sem comparação direta;
- resolver identidade de cliente por função injetada;
- produzir identidade uniforme `{ role, principal }`;
- avaliar papéis e escopos sem executar rotas.

O pacote não persiste credenciais e não conhece o cadastro de clientes.
