# Global Trust — Biometric Payment Authorization v1

**Status:** implementação candidata / contrato-first  
**Contrato:** `1.0.0`  
**Escopo:** autorização de pagamento com verificação local do usuário  
**Execução financeira real:** não incluída nesta entrega

## Objetivo

Estender o Global Trust para autorizar pagamentos com uma credencial criptográfica liberada por verificação local no dispositivo. A experiência pode usar Face ID/rosto, íris, palma, impressão digital ou PIN do dispositivo conforme o autenticador disponível.

A API Developers.digital **não recebe nem armazena imagem biométrica, template biométrico ou segredo do autenticador**. O runtime recebe somente o resultado verificável da cerimônia criptográfica e os identificadores/digests necessários para auditoria.

## Base canônica

Esta família reutiliza os contratos existentes de Global Trust:

- `IdentitySubject` para o titular;
- `CredentialMetadata` com `credentialType=passkey`;
- `AuthenticationContext` para autenticação e nível de garantia;
- `AuthorizationDecision` para `allow`, `deny` ou `pending_approval`;
- `RiskAssessment`, `AuditEvent` e `EvidenceRecord` para risco e evidência.

Não substitui nem redefine esses contratos.

## Novos contratos

### `BiometricPaymentIntent`

Representa a intenção que o usuário deverá confirmar:

- `paymentIntentId`, `subjectId`, `tenantId`, `payeeId` opacos;
- `amountMinor` inteiro positivo;
- `currency` ISO 4217;
- `purposeCode` explícito;
- janela curta de validade;
- `consentRequired=true`;
- nenhum dado sensível de instrumento de pagamento.

### `BiometricPaymentChallenge`

Representa o desafio de autenticação de uso único:

- `ceremony`: `webauthn` ou `secure_payment_confirmation`;
- `credentialId` de uma passkey;
- `challengeDigest` SHA-256;
- `paymentContextDigest` SHA-256;
- contexto visível de pagamento com recebedor, valor, moeda e finalidade;
- `userVerification=required`;
- `oneTimeUse=true`;
- sem biometria, template ou material secreto.

### `BiometricPaymentProof`

Representa somente o resultado já verificado da cerimônia:

- referência à intenção, desafio, autenticação e credencial;
- digest da assertion e do contexto do pagamento;
- `userVerified=true`;
- `verificationClass=local_user_verification`;
- `replayCheckPassed=true`;
- sem biometria, template ou material secreto.

`localVerificationMethodHint` aceita `face`, `iris`, `palm`, `fingerprint`, `device_pin`, `other` e `unknown`, mas é **sempre não autoritativo** (`methodHintAuthoritative=false`). A política de autorização não pode depender de o servidor “saber” qual biometria foi usada.

## Invariantes de segurança

1. Biometria permanece no autenticador/dispositivo.
2. O Trust recebe prova criptográfica e o sinal de user verification, não a biometria.
3. Pagamento exige autenticação por `passkey` em `aal2` ou `aal3`.
4. `userVerification` é obrigatório.
5. O desafio é de uso único e possui expiração.
6. Intenção, desafio e prova devem manter o mesmo tenant, sujeito, credencial e contexto de pagamento.
7. Valor, moeda, recebedor e finalidade são vinculados ao contexto confirmado.
8. Digests são SHA-256 em hexadecimal; conteúdo sensível não entra em auditoria/evidência.
9. O método local (`face`, `iris`, `palm` etc.) é apenas dica de UX e nunca evidência autoritativa.
10. Qualquer execução financeira permanece fora deste contrato e requer adaptador/PSP explícito, política de risco e evidência própria.

## Fluxo alvo

1. Criar `BiometricPaymentIntent`.
2. Avaliar risco e política.
3. Criar `BiometricPaymentChallenge` com `userVerification=required`.
4. O dispositivo executa WebAuthn/SPC e faz a verificação local disponível.
5. O servidor verifica a assertion, anti-replay e a vinculação dos dados da transação.
6. Criar `BiometricPaymentProof` sem material biométrico.
7. Validar `assertBiometricPaymentCeremony(...)` contra `AuthenticationContext`.
8. Emitir `AuthorizationDecision` e evidência.
9. Somente uma camada financeira aprovada pode executar a cobrança/pagamento.

## Referências técnicas

O desenho segue o modelo de WebAuthn em que user verification ocorre no autenticador e a biometria não é revelada ao Relying Party. Para pagamentos na Web, Secure Payment Confirmation permite evidência criptográfica de que detalhes da transação foram confirmados.

No Brasil, biometria vinculada a uma pessoa natural deve ser tratada como dado pessoal sensível; por isso esta arquitetura evita deliberadamente coletar ou persistir biometria na API.

## Limites desta entrega

- não captura rosto, íris, palma ou impressão digital;
- não faz reconhecimento biométrico remoto;
- não armazena template biométrico;
- não armazena private key/passkey secret;
- não movimenta dinheiro;
- não integra adquirente, banco, wallet ou PSP;
- não faz deploy;
- não declara conformidade regulatória ou certificação.
