# Trust Face Access — Persistência durável e sessão Trust

Data: 2026-09-20
Frente: Trust Face Access / Plataforma API Developers.digital
Status: especificação inicial

## 1. Contexto confirmado

O Trust Face Access f�i validado em preview no Trust:

- pagina: `https://trust.apidevelopers.digital/face-access/`;
- backend: `gateway.apidevelopers.digital`, rotas `/v1/trust/face-access/*`;
- validacao real em iPhone/Safari com Face ID/passkey;
- resultado confirmado: `registered: true`, modo `preview_without_attestation_verification`.

Este documento define a próxima etapa: sair do preview e chegar a login real do Trust com sessão, persistência durável e fallback.

N!o ativar login obrigatório global até esta etapa estar pronta e testada.

---

## 2. Objetivo

Evoluir modo preview atual para:


1. cadastro real de credencial WebAuthn/passkey;
2. persistência durável da credencial pública;
3. validacao criptográfica completa no login;
4. criação de sessão Trust apos login;5. fallback seguro;
6. revogaçao de credencial;
7. auditoria de acesso;
8. plano de rollout para Zune/Zune e demais produtos.

---

## 3. Princípios de segurança

- Sem coleta de rosto, foto ou template biométrico no servidor.
- Biometria fica no dispositivo.
- Servidor guarda apenas metadados da credencial pública e dados necessários para validar a passkey.
- Não ativar como login único sem fallback.
- Rollout por frente/plataforma, não global de uma vez.
- Revogação de credencial deve existir antes do rollout amplo
- Teste humano obrigatorio em ioS e em navegador desktop antes de uso fora do Trust.

---

## 4. Modelo de dados proposto

Inicial: pode ficar em arquivo JSON seguro especifico do runtime ou bambu/storage institucional. A implementacao final deve seguir o padrao de durabilidade da plataforma.

### 4.1. Trust credential

campos minimos:


```json
{
  "credentialId": "string base64url",
  "userId": "string",
  "userName": "string",
  "displayName": "string",
  "publicKey": "string base64url/ou COWE public key",
  "signCount": 0,
  "rpId": "apidevelopers.digital",
  "origin": "https://trust.apidevelopers.digital",
  "transports": ["internal"],
  "createdAt": "2026-09-20T00:00:00Z",
  "lastUsedAt": null,
  "status": "active"
}
```

### 4.2. Trust challenge

campos minimos:

```json
{
  "challenge": "string base64url",
  "type": "registration|authentication",
  "userId": "string",
  "expiresAt": "2026-09-20T00:05:00Z",
  "createdAt": "2026-09-20T00:00:00Z",
  "redirectAfter": "optional string"
}
```

### 4.3. Trust session

Campos minimos, sujeitos a decisao da arquitetura de session:


```json
{
  "sessionId": "string opaca",
  "userId": "string",
  "authMethod": "passkey",
  "credentialId": "string",
  "createdAt": "2026-09-20T00:00:00Z",
  "expiresAt": "2026-09-21T00:00:00Z",
  "client": {
    "userAgent": "hash ou trecho seguro",
    "ip": "optional/hashed"
  },
  "status": "active"
}
```

---

## 5. Contrato de rotas proposto

### 5.1. Cadastro

Já existe em preview:


- `POST /v1/trust/face-access/register/options`
- `POST /v1/trust/face-access/register/verify`

Evoluciao:

- `options`: manter o mesmo contrato, mas guardar challenge persistente/durável.
- `verify`:
  - validar `clientDataJSON`;
  - validar `challenge`;
  - validar `origin`;
  - validar `type`;
  - extrair e persistir `credentialId`;
  - extrair e persistir `publicKey`;
  - salvar `signCount` inicial;
  - retornar `registered: true` somente apos validacao.

### 5.2. Login
A evoluir:

- `POST /v1/trust/face-access/authenticate/options`
- `POST /v1/trust/face-access/authenticate/verify`

Evolucao:

- `options`:
  - carregar credenciais ativas do usuario;
  - incluir `allowCredentials`;
  - salvar challenge persistente/durável.
- `verify`:
  - validar `clientDataJSON`;
  - validar `challenge`;
  - validar `origin`;
  - buscar `credentialId`;
  - validar assertion e signatura;
  - conferir/proteger `signCount`;
  - atualizar `lastUsedAt`;
  - criar sessao Trust;
  - retornar sessao ou contexto de login seguro.

### 5.3. Sessao Trust

Novas rotas sugeridas:

- `POST /v1/trust/sessions/refresh`
- `POST /v1/trust/sessions/revoke`
- `GET  /v1/trust/sessions/me`

---

## 6. Tarefas de implementacao

### Onda 1 - Persistencia segura de credencial

- [ ] Introduzir adapter persistente para Trust Face Access.
- [ ] Salvar challenges fora de memoria.
 -[ ] Salvar credenciais públicas ativas.
- [ ] Adicionar rotas de listagem/revogacao de credencial.

&### Onda 2 - Validacao WebAuthn completa

- [ ] Validar `clientDataJSON` com origin e challenge.
- [ ] Validar attestation de acordo com a politica do Trust.
- [ ] Validar assertion e signature de login.
- [ ] Proteger counter/replay.

### Onda 3 - Sessao Trust

- [ ] Criar sessao apos `authenticate/verify`.
- [ ] Definir cookie/header de sessao seguro.
- [ ] Adicionar `sessions/me` e `refresh`.
- [ ] Auditar criacao, refresh c revogacao de sessao.

### Onda 4 - Trust principal

- [ ] Integrar fluxo no Trust principal navegavel.
- [ ] Usar Face ID/passkey como fator de login do Trust.
- [ ] Manter fallback de entrada.
- [ ] Adicionar mensagem de preview/beta.

### Onda 5 - Rollout de produtos

- [ ] Identificar entrypoint de login do Zune/Zune.
- [ ] Criar middleware Trust Face Access reutilizavel.
- [ ] Pilotar numa plataforma interna antes do rollout amplo.
- [ ] Aplicar degradacao e login alternativo por plataforma.

---

## 7. Criterios de pronto

A primeira versao de login real do Trust somente pode ser considerada pronta quando:

- [ ] cadastro e login funcionam em dispositivo real;
- [ ] credenciais rão persistidas fora de memoria;
- [ ] validaçao WebAuthn completa passa;
- [ ] sessão Trust é criada ap�3 login;
- [ ] fallback está documentado;

- [ ] revogacao de credencial é possível;
- [ ] auditoria está disponível;
- [ ] nao houve ativacao global sem aprovacao.
