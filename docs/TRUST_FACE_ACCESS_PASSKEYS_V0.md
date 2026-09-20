# Trust Face Access v0 — Passkeys/WebAuthn

Status: preview controlado  
Branch: `ada/trust-face-access-passkeys-v0`  
Domínio alvo: `trust.apidevelopers.digital`

## Objetivo

Transformar o Trust na entrada biométrica das plataformas API Developers.digital usando Face ID, Touch ID, biometria Android, Windows Hello ou chaves de segurança por meio de Passkeys/WebAuthn.

## Decisão de segurança

O Trust Face Access não deve armazenar foto, rosto ou template biométrico.

A autenticação facial acontece no dispositivo do usuário. O servidor recebe apenas uma prova criptográfica WebAuthn vinculada a uma credencial pública.

## Escopo v0

- Gerar opções de cadastro de passkey.
- Gerar opções de autenticação por passkey.
- Exigir verificação local do usuário (`userVerification: "required"`).
- Preferir autenticador de plataforma (`authenticatorAttachment: "platform"`).
- Usar `apidevelopers.digital` como Relying Party ID.
- Preparar base testável antes de expor rotas públicas e antes de publicar em produção.

## Contrato de API v0

Rotas já preparadas no API Gateway:

```txt
GET  /v1/trust/face-access/status
POST /v1/trust/face-access/register/options
POST /v1/trust/face-access/authenticate/options
```

Rotas de verificação preparadas em adapter testado e prontas para encaixe no servidor:

```txt
POST /v1/trust/face-access/register/verify
POST /v1/trust/face-access/authenticate/verify
```

### `register/options`

Entrada mínima:

```json
{
  "userId": "igor",
  "userName": "igor@apidevelopers.digital",
  "displayName": "Igor"
}
```

Saída: objeto `publicKey` compatível com `navigator.credentials.create(...)`.

### `register/verify`

Entrada preview:

```json
{
  "userId": "igor",
  "challenge": "challenge-issued-by-options",
  "credentialId": "credential-id-returned-by-browser",
  "transports": ["internal"]
}
```

Saída preview:

```json
{
  "registered": true,
  "credentialId": "credential-id-returned-by-browser",
  "mode": "preview_without_attestation_verification"
}
```

### `authenticate/options`

Entrada mínima:

```json
{
  "userId": "igor"
}
```

Saída: objeto `publicKey` compatível com `navigator.credentials.get(...)`.

### `authenticate/verify`

Entrada preview:

```json
{
  "userId": "igor",
  "challenge": "challenge-issued-by-options",
  "credentialId": "credential-id-returned-by-browser"
}
```

Saída preview:

```json
{
  "authenticated": true,
  "userId": "igor",
  "credentialId": "credential-id-returned-by-browser",
  "mode": "preview_without_assertion_signature_verification"
}
```

## Fora do escopo v0

- Reconhecimento facial server-side.
- AWS Rekognition como porta de entrada.
- Armazenamento de imagem facial.
- Login obrigatório global em todas as plataformas sem piloto prévio.
- Deploy automático em produção.

## Próximas etapas técnicas

1. Conectar o adapter `trust-face-access-http-routes.mjs` ao `server.mjs`.
2. Expor as rotas públicas `/register/verify` e `/authenticate/verify`.
3. Adicionar testes de rota no API Gateway para as duas rotas públicas.
4. Adicionar tela no portal Trust para cadastro e entrada com Face ID/passkey.
5. Persistir credenciais públicas em storage durável.
6. Validar atestação/assertion WebAuthn completa antes de liberar produção.
7. Executar piloto interno em `trust.apidevelopers.digital`.
