# Adaptador HTTP do Portal Projector

**Status:** implementação interna validada  
**Pacote:** `@apidevelopers/portal-projector-http`  
**Mutação:** proibida  
**Servidor:** não incluído

## Objetivo

Adaptar a API institucional de leitura do Portal para um contrato HTTP abstrato, sem acoplar o núcleo a framework, socket, identidade, política de autorização ou ambiente.

## Dependências injetadas

- `readApi`
- `authenticate(headers, request)`
- `authorize(identity, context)`

O adaptador rejeita APIs mutáveis e não aceita `publish`, `publisher` ou `write`.

## Rotas

- `GET /v1/portal/snapshot`
- `GET /v1/portal/summary`
- `GET /v1/portal/records`
- `GET /v1/portal/records/:institutionalType/:institutionalId`
- `GET /v1/portal/versions`

## Segurança

- somente `GET`;
- autenticação obrigatória;
- autorização por ação e recurso;
- respostas `private, no-store`;
- erros internos e detalhes de autenticação não são expostos;
- nenhuma credencial é armazenada;
- nenhuma escrita no Git ou no store;
- nenhuma referência ao publisher.

## Limites

Este pacote não abre servidor, não implementa TLS, CORS, rate limit, tenant, autenticação, política de autorização, telemetria, persistência, release ou deploy.
