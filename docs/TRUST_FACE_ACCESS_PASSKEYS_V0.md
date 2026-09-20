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

## Fora do escopo v0

- Reconhecimento facial servidor-side.
- AWS Rekognition como porta de entrada.
- Armazenamento de imagem facial.
- Login obrigatório global em todas as plataformas sem piloto prévio.
- Deploy automático em produção.

## Próximas etapas técnicas

1. Conectar o serviço `trust-face-access-passkeys.mjs` ao API Gateway.
2. Expor rotas `/v1/trust/face-access/*`.
3. Adicionar tela no portal Trust para cadastro e entrada com Face ID/passkey.
4. Persistir credenciais públicas em storage durável.
5. Validar atestação/assertion WebAuthn completa antes de liberar produção.
6. Executar piloto interno em `trust.apidevelopers.digital`.
