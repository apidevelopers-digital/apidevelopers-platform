# @API Developers/auth

Pacote canônico de autenticação e identidade técnica da API Developers.digital.

## Responsabilidades

- validar credenciais;
- representar usuários, contas de serviço e API keys;
- emitir identidade autenticada para o contexto da requisição;
- separar autenticação de autorização e tenancy;
- suportar rotação e revogação de credenciais.

## Tipos de principal

- `user`
- `service_account`
- `api_key`
- `session`
- `external_identity`

## Regras

1. Nenhuma credencial válida autoriza acesso sem permissão explícita.
2. Credenciais não carregam tenant de forma implícita.
3. Segredos não são retornados por logs, eventos ou respostas.
4. API keys possuem scope, rotação e revogação.
5. Sessões humanas e contas de serviço têm ciclos de vida separados.
6. Autenticação não substitui auditoria.

## Contratos iniciais

- `AuthenticatedPrincipal`
- `AuthContext`
- `ApiKeyRef`
- `ServiceAccountRef`
- `SessionRef`
- `CredentialRevocation`

## Status

Foundation v1 em implementação.
