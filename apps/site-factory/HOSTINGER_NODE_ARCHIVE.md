# Hostinger Node.js source archive

Este contrato prepara, valida e registra o archive de projeto-fonte usado por uma futura implantação do preview institucional.

## Origem

O archive é gerado no SHA exato do GitHub a partir do template React/Vite da Site Factory.

Projeto alvo:

- app: `apidevelopers`
- domínio canônico: `apidevelopers.digital`
- preview: `preview-apidevelopers.apidevelopers.digital`
- runtime: React + Vite
- Node.js: 22
- build: `npm run build`
- saída: `dist`

## Conteúdo permitido

O ZIP contém o projeto-fonte e o lockfile. Ele não contém:

- `node_modules/`
- `dist/`
- `build/`
- `.next/`
- `.git/`
- `.env*`
- chaves privadas ou certificados

O limite máximo validado é 50 MB.

## Contrato futuro da Hostinger

A API oficial oferece o endpoint:

`POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive`

Esse endpoint envia o archive, detecta as configurações pelo `package.json` e inicia o build. A execução real não faz parte deste workflow.

## Barreiras

O plano gerado mantém:

- `mode=dry-run`
- `readyForApply=false`
- `writesEnabled=false`
- `deployEnabled=false`
- `dnsEnabled=false`
- `hostingerWriteExecuted=false`

O workflow não recebe `HOSTINGER_API_TOKEN`, não chama a Hostinger e não altera DNS.
