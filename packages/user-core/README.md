# @apidevelopers/user-core

Domínio canônico de usuário, perfil, verificação de e-mail e ciclo de conta da API Developers.digital.

## Responsabilidades

- criar a entidade `user`;
- normalizar e proteger e-mails únicos;
- controlar estados `pending_verification`, `active`, `restricted`, `suspended` e `deleted`;
- registrar verificação de e-mail;
- atualizar perfil e metadados;
- retornar eventos de domínio;
- definir contrato substituível de repositório;
- oferecer adaptador em memória para testes e bootstrap.

## Limite com `auth` e `auth-core`

`user-core` não armazena senha, token, API Key ou sessão.

Os pacotes de autenticação continuam responsáveis por:

- credenciais e provas;
- autenticação;
- sessões;
- autorização;
- escopos;
- revogação e rotação de credenciais.

`user-core` fornece o estado da conta humana que esses mecanismos consultam.

## Eventos

- `user.registered`
- `user.email_verified`
- `user.profile_updated`
- `user.restricted`
- `user.suspended`
- `user.reactivated`
- `user.deleted`

## Validação

```bash
npm --prefix packages/user-core run check
```
