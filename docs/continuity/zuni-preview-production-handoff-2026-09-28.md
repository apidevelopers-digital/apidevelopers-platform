# Continuidade — Trust Face/Gateway → Zuni Preview + Production Handoff

Data operacional: 2026-09-28  
Frente: Zuni Preview + Zuni Production / Trust Face Access / Browser Session Handoff  
Repositórios envolvidos:
- `apidevelopers-digital/apidevelopers-platform`
- `apidevelopers-digital/unico-api-platform`

## Status confirmado

A frente Trust Face/Gateway → Zuni foi validada nos dois ambientes:

```txt
preview-zuni.sitedauni.com
zuni.sitedauni.com
```

Fluxo confirmado:

```txt
Gateway / Trust Face
→ emite trustLoginToken + trustLoginVerifier
→ redireciona para o Zuni por fragment/hash
→ Zuni lê o hash no navegador
→ Zuni chama endpoint PHP local
→ PHP chama Node intermediário
→ Node chama Gateway redeem
→ Gateway valida o handoff
→ Zuni cria sessão local
→ app abre autenticado
```

Validação manual confirmada por Igor:
- preview: entrada real no Zuni pelo handoff;
- production: entrada real no Zuni principal pelo handoff.

Percentual operacional estimado:

```txt
Trust Face/Gateway → Zuni Preview + Production Handoff: 98% ±1%
```

## Gateway

Repositório: `apidevelopers-digital/apidevelopers-platform`  
Branch de deploy: `deploy/hostinger-gateway-runtime`

### Rotas preview

```txt
POST /v1/zuni/browser-session/handoff/issue
POST /v1/zuni/browser-session/handoff/redeem
GET  /v1/zuni/browser-session/handoff/authorize
```

Target:

```txt
https://preview-zuni.sitedauni.com
```

### Rotas production

```txt
POST /v1/zuni-production/browser-session/handoff/issue
POST /v1/zuni-production/browser-session/handoff/redeem
GET  /v1/zuni-production/browser-session/handoff/authorize
```

Target:

```txt
https://zuni.sitedauni.com
```

### Credenciais de redeemer

Preview e production ficaram separados.

Variáveis relevantes no Gateway:

```txt
ZUNI_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION
ZUNI_PRODUCTION_HANDOFF_REDEEMER_AUTHORIZATION
```

Observação: valores não devem ser salvos em documentação, PHP, public_html ou conversa.

### PRs relevantes do Gateway

```txt
PR #623 — enable Zuni preview browser handoff
PR #637 — add Zuni preview handoff authorize redirect
PR #649 — add Zuni production handoff routes
PR #650 — isolate Zuni production redeemer authorization
```

## Node intermediário

Repositório: `apidevelopers-digital/unico-api-platform`  
Branch de deploy do Node Preview: `deploy/hostinger-node-preview-runtime`  
Node: `node-preview.apidevelopers.digital`

### Endpoint preview

```txt
POST /operator/v1/zuni/trust-login-token/redeem
```

Gateway redeem chamado:

```txt
https://gateway.apidevelopers.digital/v1/zuni/browser-session/handoff/redeem
```

### Endpoint production

```txt
POST /operator/v1/zuni-production/trust-login-token/redeem
```

Gateway redeem chamado:

```txt
https://gateway.apidevelopers.digital/v1/zuni-production/browser-session/handoff/redeem
```

### Variáveis relevantes no Node Preview

```txt
ZUNI_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION
ZUNI_PREVIEW_HANDOFF_REDEEM_URL=https://gateway.apidevelopers.digital/v1/zuni/browser-session/handoff/redeem

ZUNI_PRODUCTION_HANDOFF_REDEEMER_AUTHORIZATION
ZUNI_PRODUCTION_HANDOFF_REDEEM_URL=https://gateway.apidevelopers.digital/v1/zuni-production/browser-session/handoff/redeem
```

O valor de `ZUNI_PRODUCTION_HANDOFF_REDEEMER_AUTHORIZATION` deve ser idêntico ao valor salvo no Gateway para `ZUNI_PRODUCTION_HANDOFF_REDEEMER_AUTHORIZATION`.

### PRs relevantes do Node/operador

```txt
PR #720 — add Zuni trust handoff redeem bridge
PR #761 — add Zuni production handoff redeem bridge
PR #763 — allow Zuni production public root on node-preview runtime
PR #764 — allow Zuni production public root on unico runtime
```

Observação: o PR #763 liberou root no runtime do `node-preview`, mas a ponte ativa desta action roda em `unico.sitedauni.com`, branch `deploy/hostinger-unico-production-runtime`. O PR #764 aplicou a liberação correta no runtime ativo.

## Preview Zuni

Domínio: `https://preview-zuni.sitedauni.com`  
Root: `/home/u242521810/domains/sitedauni.com/public_html/preview-zuni`

Arquivos relevantes:

```txt
api/trust-login-token.php
assets/zuni-trust-handoff-v1.js
landing.php
```

Comportamento:
- JS lê `#trustLoginToken` e `trustLoginVerifier`;
- JS remove o hash do navegador;
- PHP chama Node intermediário preview;
- PHP cria sessão local Zuni;
- segredo de redeemer não fica em PHP/public_html;
- login tradicional permanece preservado.

## Production Zuni

Domínio: `https://zuni.sitedauni.com`  
Root: `/home/u242521810/domains/zuni.sitedauni.com/public_html`

Arquivos aplicados:

```txt
api/trust-login-token.php
assets/zuni-trust-handoff-v1.js
landing.php
```

Hashes observados após patch production:

```txt
api/trust-login-token.php
79a11ff2f8fb4a94eaae555c530a55f47ec74b2274fd0d1c7315086e36f2af01

assets/zuni-trust-handoff-v1.js
e72d57dac6adc9c3f23c7e66890d9d6665a97e35ed5e374728fc95a2665c5ef8

landing.php
b418e2696fdb73e8a50a3dfb884701953e23c5a0aa5a3c7f91d10e8010f5d5c9
```

Backup criado na alteração da landing production:

```txt
/home/u242521810/operator-backups/landing.php-2026-09-27T13-30-29-704Z-write
```

Comportamento:
- produção lê hash no navegador;
- chama `api/trust-login-token.php`;
- PHP chama Node production bridge;
- Node chama Gateway production redeem;
- Gateway valida com credencial production isolada;
- PHP cria sessão local compatível com `src/auth.php`;
- `uj_backend_session_expires_at` é salvo como timestamp inteiro;
- login tradicional permanece preservado;
- `trust-callback.php` antigo foi preservado.

## Testes confirmados

### Preview — diagnóstico com token inválido

Diagnóstico temporário criado e removido:

```txt
preview-zuni/api/trust-handoff-diagnostic.php
```

Resultado observado:

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

### Preview — rota authorize sem sessão

URL:

```txt
https://gateway.apidevelopers.digital/v1/zuni/browser-session/handoff/authorize
```

Resultado esperado/observado sem sessão:

```json
{
  "ok": false,
  "error": "source_session_required",
  "diagnostic": "zuni_preview_handoff_authorize",
  "secretReturned": false,
  "writes": false
}
```

### Preview — teste real

Confirmado por Igor:

```txt
"Já entrei pelo zuni"
```

Leitura operacional: fluxo preview validado ponta a ponta.

### Production — diagnóstico com token inválido

Diagnóstico temporário criado e removido:

```txt
zuni.sitedauni.com/api/trust-handoff-production-diagnostic.php
```

Resultado observado:

```json
{
  "ok": false,
  "nodeReachable": true,
  "expectedFailure": false,
  "upstreamStatus": 401,
  "upstreamError": "handoff_invalid_expired_or_redeemed",
  "redeemerConfiguredLikely": true,
  "secretReturned": false,
  "writes": false
}
```

Leitura operacional: apesar de `expectedFailure:false`, o erro foi compatível com token falso e confirmou reachability, credencial production e resposta segura.

### Production — rota authorize sem sessão

URL:

```txt
https://gateway.apidevelopers.digital/v1/zuni-production/browser-session/handoff/authorize
```

Resultado esperado/observado sem sessão:

```json
{
  "ok": false,
  "error": "source_session_required",
  "diagnostic": "zuni_production_handoff_authorize",
  "secretReturned": false,
  "writes": false
}
```

### Production — teste real

Confirmado por Igor: entrada normal no Zuni principal após usar o fluxo production.

Leitura operacional: fluxo production validado ponta a ponta.

## Temporários removidos

Arquivos temporários removidos:

```txt
preview-zuni/api/trust-handoff-diagnostic.php
preview-zuni/trust-handoff-pkce-test.html
zuni.sitedauni.com/api/trust-handoff-production-diagnostic.php
zuni.sitedauni.com/trust-handoff-production-pkce-test.html
```

Backups registrados:

```txt
/home/u242521810/operator-backups/trust-handoff-diagnostic.php-2026-09-25T10-01-39-210Z-soft-delete
/home/u242521810/operator-backups/trust-handoff-pkce-test.html-2026-09-27T07-33-37-024Z-soft-delete
/home/u242521810/operator-backups/trust-handoff-production-diagnostic.php-2026-09-27T13-40-06-019Z-soft-delete
/home/u242521810/operator-backups/trust-handoff-production-pkce-test.html-2026-09-28T05-32-42-591Z-soft-delete
```

## Rollback operacional

### Production

Para rollback funcional do handoff production:

1. remover ou desabilitar o carregamento do asset em `zuni.sitedauni.com/public_html/landing.php`;
2. opcionalmente remover:
   - `api/trust-login-token.php`;
   - `assets/zuni-trust-handoff-v1.js`;
3. manter login tradicional preservado;
4. se necessário, restaurar `landing.php` pelo backup:

```txt
/home/u242521810/operator-backups/landing.php-2026-09-27T13-30-29-704Z-write
```

### Gateway/Node

Para desabilitar production sem mexer em arquivos PHP:
- remover/desativar `ZUNI_PRODUCTION_HANDOFF_REDEEMER_AUTHORIZATION` no Gateway;
- remover/desativar `ZUNI_PRODUCTION_HANDOFF_REDEEMER_AUTHORIZATION` no Node Preview;
- production handoff deixa de validar redeem, mas preview permanece preservado.

## Pendências

Para considerar 100%:

1. registrar esta continuidade na branch de deploy;
2. opcional: criar teste automatizado/smoke para reachability das rotas `authorize` sem sessão;
3. opcional: ajustar diagnóstico interno para tratar `handoff_invalid_expired_or_redeemed` como falha esperada em token falso;
4. opcional: consolidar naming dos arquivos, pois a composição ainda usa nome histórico `zuni-preview-composition` mesmo atendendo preview + production;
5. opcional: criar documentação curta para operação de variáveis no hPanel.

## Próxima ação recomendada

Salvar este documento no GitHub e encerrar a frente como operacionalmente validada:

```txt
Trust Face/Gateway → Zuni Preview + Production Handoff: 98% ±1%
```
