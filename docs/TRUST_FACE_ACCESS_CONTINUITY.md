# Trust Face Access — Continuidade

Data: 2026-09-20
Frente: Trust / Plataforma API Developers.digital
Estado: Preview funcional no Trust

---

## 1. Status confirmado

Confirmado:

- O PR `#552` foi mergeado na `main` com a base Trust Face Access por Passkeys/WebAuthn.
- A pagina de preview foi publicada em:
  - `https://trust.apidevelopers.digital/face-access/`
- O Gateway foi publicado no runtime Hostinger atraves da branch:
  - `deploy/hostinger-gateway-runtime`
- O fluxo de cadastro do Face ID/passkey foi validado no Trust a partir de um iPhone com Safari.
- Evidência visual do teste:
  - a usuário abriu a tela `Trust Face Access`;
  - o navegador abriu o Face ID/passkey;
  - o Trust recebeu a resposta de cadastro;

Resultado observado no preview:

```json
{
  "registered": true,
  "credentialId": "...",
  "mode": "preview_without_attestation_verification"
}
```

Conclusão operacional:

- o Trust visual está no ar;
- o fluxo browser → gateway está funcionando;

- o cadastro de credential por Face ID/passkey foi confirmado em preview;

- não houve coleta de rosto, foto ou template biométrico pelo servidor.

---

## 2. Arquivos e rotas entregues no PR #552

API Gateway:

- `apps/api-gateway/src/trust-face-access-passkeys.mjs`
- `apps/api-gateway/src/trust-face-access-http-routes.mjs`
- `apps/api-gateway/src/trust-face-access-server-bindings.mjs`
- `apps/api-gateway/src/server.mjs`

Rotas gateway:

- `GET /v1/trust/face-access/status`
- `POST /v1/trust/face-access/register/options`
- `POST /v1/trust/face-access/register/verify`
- `POST /v1/trust/face-access/authenticate/options`
- `POST /v1/trust/face-access/authenticate/verify`

Site Factory / preview:

- `apps/site-factory/preview/trust-face-access/index.html`
- `apps/site-factory/preview/trust-face-access/trust-face-access-preview.js`
- `apps/site-factory/test/trust-face-access-preview.test.mjs`

Testes incluédos para serviço, rotas, bindings e preview.

---

## 3. Ajustes operacionais aplicados fora do PR

Por demanda do teste em produção, foram feitos dois ajustes manuais operacionais no Hostinger.

Ertes ajustes devem ser posteriormente versionados/documentados no repositório de infra ou no próprio mecanismo de runtime.

### 3.1. Preview publicado no Trust

Arquivos publicados:

- `/home/u242521810/domains/apidevelopers.digital/public_html/trust/face-access/index.html`
- `/home/u242521810/domains/apidevelopers.digital/public_html/trust/face-access/trust-face-access-preview.js`

Configuração final do JS publicado:

- `DEFAULT_API_BASE = "https://gateway.apidevelopers.digital"`

PR de versionamento relacionado:

- `#557 — Point Trust Face Access preview to gateway domain`

Observação - o PR `#557` está aberto por pendência de check don `Site Factory Hostinger Node Contract Monitor`. A correção, porém, já está aplicada no arquivo publicado no Trust.

### 3.2. CORS do Gateway para o Trust

Arquivo alterado na Hostinger:

- `/home/u242521810/domains/gateway.apidevelopers.digital/public_html/.htaccess`

Objetivo:

- permitir fetch de:
  - `https://trust.apidevelopers.digital`
  - `https://trust-preview.apidevelopers.digital`
- responder `OPTIONS` para chamadas de preflight;
- manter o CORS restrito ao Trust e Trust Preview.

Backup criado antes da alteração:

- `/home/u242521810/operator-backups/.htaccess-2026-09-20T23-08-58-463Z-write`

Hash da versão aplicada:


```txt
a4948c2548bf726c5fe5126445e5d3fbec719f73fd670104330400a161f1ea9b
```

---

## 4. Pendências para sair de preview

Pendente antes de usar nas demais plataformas como login real:

1. Persistência durável das credenciais públicas.
2. Validação WebAuthn completa em produção:
	- challenge;
	- origin;
	- rp id;
	- attestation ou política indicada;
	- assertion;
	- signature;
	- counter de segurança.
3. Sessão real do Trust após login por passkey.
4. Fallback seguro:
   - login por outro f�tor;
   - recuperação de conta;
   - revogação de credencial.
5. Auditoria dos logins Trust.
6. Política de rollout por plataforma.
7. Plano para degradação caso alguma plataforma não suporte passkey/Face ID.

---

## 5. Próxima etapa: main do Trust

O objetivo da próxima etapa é evoluir o preview atual para login real do Trust.

Ordem recomendada:

1. Estabilizar o contrato de credencial persistente.
	- userId;
	- credentialId;
	- publicKey;
	- counter;
	- transports;
	- datas de criação/fluxo;
	- status da credencial.

2. Adicionar endpoints persistentes para credencial.
3. Criar sessão Trust após `authenticate/verify`.
4. Conectar o Trust principal ao Face Access como fator de login.
5. Medir fallback e manter login alternativo.
6. Após a estabilização, abrir frente de rollout para:
	- Zune/Zune;
	- Radar;
	- portal interno;
	- outros produtos API Developers.digital.

---

## 6. Norma de rollout para outras plataformas

O Face ID/passkey não deve ser ativado globalmente como obrigatório até existir:

- persistência durável;
- validação WebAuthn completa;
- sessão Trust;
- fallback seguro;
- monitoramento;
- documentação de rollback;
- teste humano em pelo menos um dispositivo ioS e um novegador desktop.

A primeira onda confirmada de plataformas é para:


1. Trust principal;

2. Zune/Zune;

3. demais produtos institucionais defb�idos por Igor.
