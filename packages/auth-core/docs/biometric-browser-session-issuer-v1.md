# Biometric Browser Session Issuer v1

Status: sandbox-conformance; non-production.

This module is the session stage after `trust-biometric-login-decision/v1`.

Flow:

`authorized biometric login decision -> explicit sandbox issuance policy -> random browser secret -> SHA-256 session hash persisted -> __Host- cookie -> browser-session authenticator`

Security boundaries:

- accepts only an already-authorized sandbox biometric login decision;
- requires face sandbox authentication and an active SaaS principal;
- requires the SaaS access decision to be allowed;
- requires the source handoff to remain unissued and point to `auth-core-session-issuance`;
- rejects raw image/video/template/embedding/biometric/key/KMS/secret/token/cookie material in the source decision;
- requires an explicit session-issuance policy with `productionValidated=false`;
- generates 32 random bytes for the browser session secret;
- persists only the SHA-256 hash, never the raw session secret or Set-Cookie header;
- emits a `__Host-` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and bounded Max-Age;
- caps this sandbox issuer to one hour;
- remains `productionAuthorized=false` and `productionReady=false`.

The test suite includes a round trip through the existing `createBrowserSessionAuthenticator`, proving that a session issued from an authorized biometric decision can be authenticated back to the same principal without storing the raw secret.

This does not prove production biometric recognition, production liveness/PAD, production session storage, production cookie deployment, external biometric validation, template-vault/KMS readiness, or production authorization.
