# Rascunho auditável de criação do website de preview

Esta etapa pertence à **Onda 13** e prepara somente o contrato auditável para uma futura chamada:

```text
POST /api/hosting/v1/websites
```

O contrato oficial da Hostinger exige:

```json
{
  "domain": "preview-apidevelopers.apidevelopers.digital",
  "order_id": "1009450581",
  "datacenter_code": "<código confirmado pelo preflight>"
}
```

## Garantias

O rascunho mantém:

```text
mode: approval-draft
executable: false
approvalRequired: true
writesEnabled: false
provisioningEnabled: false
dnsEnabled: false
deployEnabled: false
```

Ele não chama o endpoint `POST`.

## Evidência obrigatória

O `datacenter_code` só é aceito quando estiver presente em um preflight recente e real da Hostinger API:

```text
GET /api/hosting/v1/datacenters?order_id=...
```

O rascunho também exige:

- produto `business-web-hosting`;
- preflight somente leitura;
- fingerprint do preflight;
- pedido mascarado compatível com o `order_id`;
- domínio igual ao manifesto canônico;
- SHA GitHub completo;
- preflight com no máximo seis horas.

## Ações que continuam bloqueadas

- criar o website;
- conectar repositório;
- enviar arquivo;
- iniciar build Node.js;
- configurar DNS;
- executar deploy;
- alterar o domínio principal;
- alterar ou remover o WordPress atual;
- escrever em produção.

## Geração local ou em workflow

```text
node src/run-hostinger-website-create-draft.mjs \
  --manifest manifests/apidevelopers-digital.github-first.json \
  --preflight /caminho/preflight.json \
  --output /caminho/website-create-draft.json \
  --order-id 1009450581 \
  --datacenter-code <código> \
  --repository apidevelopers-digital/apidevelopers-platform \
  --source-sha <sha-completo>
```

O resultado recebe fingerprint SHA-256 e um token específico de aprovação. Esse token autoriza, em etapa posterior e separada, somente a criação do website isolado de preview. Não autoriza DNS, upload, build ou deploy.
