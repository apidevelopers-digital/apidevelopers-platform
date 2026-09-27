# Continuidade — Trust Face/Gateway → Zuni Preview Handoff

Data operacional: 2026-09-27  
Frente: Zuni Preview / Trust Face Access / Browser Session Handoff  
Repositórios envolvidos:
- `apidevelopers-digital/apidevelopers-platform`
- `apidevelopers-digital/unico-api-platform`

## Status confirmado

A frente `Trust Face/Gateway → Zuni Preview Handoff` foi validada ponta a ponta no preview.

Fluxo confirmado:

```txt
Gateway / Trust Face
→ emite trustLoginToken + trustLoginVerifier
→ redireciona para preview-zuni via fragment/hash
→ preview-zuni lê o hash no browser
→ preview-zuni chama node-preview
→ node-preview faz redeem no gateway
→ Zuni cria sessão local
```

Validação manual confirmada pelo Igor: entrada realizada no Zuni pelo fluxo de handoff.

Percentual operacional estimado da frente:

```txt
96% ±2%
```

## Componentes publicados

### Gateway — `gateway.apidevelopers.digital`

Repositório:

```txt
apidevelopers-digital/apidevelopers-platform
```

Branch de deploy:

```txt
deploy/hostinger-gateway-runtime
```

Rotas publicadas para Zuni Preview:

```txt
POST /v1/zuni/browser-session/handoff/issue
POST /v1/zuni/browser-session/handoff/redeem
GET  /v1/zuni/browser-session/handoff/authorize
```

Target permitido:

```txt
https://preview-zuni.sitedauni.com
```

Segurança implementada:

- PKCE S256;
- token one-time;
- TTL curto;
- `Cache-Control: no-store`;
- `Referrer-Policy: no-referrer`;
- sem segredo em URL;
- redirect por fragment/hash;
- login tradicional do Zuni preservado.

PRs relevantes:

```txt
PR #623 — enable Zuni preview browser handoff
PR #637 — add Zuni preview handoff authorize redirect
```

### Node Preview — `node-preview.apidevelopers.digital`

Repositório:

```txt
apidevelopers-digital/unico-api-platform
```

Branch de deploy:

```txt
deploy/hostinger-node-preview-runtime
```

Endpoint intermediário publicado:

```txt
POST /operator/v1/zuni/trust-login-token/redeem
```

Função:

```txt
preview-zuni PHP
→ node-preview
→ gateway /v1/zuni/browser-session/handoff/redeem
→ resposta sanitizada
```

Variáveis usadas no Node Preview:

```txt
ZUNI_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION
ZUNI_PREVIEW_HANDOFF_REDEEM_URL
GATEWAY_API_BASE
```

PR relevante:

```txt
PR #720 — add Zuni trust handoff redeem bridge
```

### Preview Zuni — `preview-zuni.sitedauni.com`

Arquivos publicados na Hostinger:

```txt
/domains/sitedauni.com/public_html/preview-zuni/api/trust-login-token.php
/domains/sitedauni.com/public_html/preview-zuni/assets/zuni-trust-handoff-v1.js
/domains/sitedauni.com/public_html/preview-zuni/landing.php
```

Função:

- JS lê `#trustLoginToken` e `trustLoginVerifier`;
- JS remove hash do navegador;
- PHP local chama o Node Preview;
- PHP cria sessão local do Zuni;
- PHP não guarda segredo de redeemer.

Observação de segurança:

```txt
Nenhum segredo de redeemer deve ser salvo em PHP/public_html.
```

## Variáveis e segredos

### Gateway

Variáveis relevantes:

```txt
UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION
ZUNI_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION
```

Observação: durante a validação, `UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION` já existia no Gateway com valor no formato `Bearer ...`.

### Node Preview

Variáveis confirmadas/necessárias:

```txt
ZUNI_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION
ZUNI_PREVIEW_HANDOFF_REDEEM_URL=https://gateway.apidevelopers.digital/v1/zuni/browser-session/handoff/redeem
GATEWAY_API_BASE=https://gateway.apidevelopers.digital
```

## Testes confirmados

### Diagnóstico temporário Node reachability

Foi criado e depois removido:

```txt
preview-zuni/api/trust-handoff-diagnostic.php
```

Resultado observado com token inválido:

```json
{
  "ok": true,
  "nodeReachable": true,
  "expectedFailure": true,
  "upstreamStatus": 401,
  "upstreamError": "handoff_code_invalid",
  "redeemerConfiguredLikely": true,
  "secretReturned": false,
  "writes": false
}
```

Leitura: `preview-zuni → node-preview → gateway` funcionou sem expor segredo.

### Rota authorize sem sessão

URL testada:

```txt
https://gateway.apidevelopers.digital/v1/zuni/browser-session/handoff/authorize
```

Resposta esperada e observada sem sessão:

```json
{
  "ok": false,
  "error": "source_session_required",
  "diagnostic": "zuni_preview_handoff_authorize",
  "secretReturned": false,
  "writes": false
}
```

Leitura: a rota está publicada e protegida.

### Teste real com sessão

Validação manual informada pelo Igor:

```txt
"Já entrei pelo zuni"
```

Leitura operacional: fluxo real confirmado no preview.

## Arquivos temporários removidos

Removidos após uso:

```txt
preview-zuni/api/trust-handoff-diagnostic.php
preview-zuni/trust-handoff-pkce-test.html
```

Backups registrados pelo operador:

```txt
/home/u242521810/operator-backups/trust-handoff-diagnostic.php-2026-09-25T10-01-39-210Z-soft-delete
/home/u242521810/operator-backups/trust-handoff-pkce-test.html-2026-09-27T07-33-37-024Z-soft-delete
```

## Pendências

Para considerar a frente 100%:

1. decidir se o fluxo será replicado para `zuni.sitedauni.com` produção;
2. criar PR/patch específico para produção, com target de produção separado;
3. validar cookies/sessão em produção;
4. revisar hardening final dos arquivos publicados no preview;
5. registrar plano de rollback de produção antes de qualquer aplicação real.

## Próxima ação recomendada

Antes de produção, preparar um plano separado:

```txt
Trust Face/Gateway → Zuni Production Handoff
```

com novo target:

```txt
https://zuni.sitedauni.com
```

e paths/variáveis dedicados ou confirmação explícita de reaproveitamento seguro.
