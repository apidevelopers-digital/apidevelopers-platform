# Client Operator Actions

Gateway API-only para operar contas externas de clientes da API Developers.digital.

## Escopo desta implantação

Esta aplicação foi preparada para uma implantação isolada do cliente `petra-advocacia` e oferece duas superfícies separadas:

- `POST /v1/github/execute`
- `POST /v1/hostinger/execute`

Cada implantação fica presa a um único cliente pelo ambiente `CLIENT_SLUG`. O cliente não pode ser escolhido no corpo da requisição.

## Segredos

Nunca versionar credenciais.

Variáveis esperadas no cofre do ambiente:

- `ACTION_GATEWAY_TOKEN`
- `PETRA_GITHUB_TOKEN`
- `PETRA_HOSTINGER_TOKEN`
- `CLIENT_SLUG=petra-advocacia`
- `GITHUB_API_VERSION` opcional

O CPF e outros documentos pessoais não fazem parte da autenticação por API e não devem ser armazenados neste repositório.

## Política operacional

- `GET` e `HEAD`: leitura real.
- `POST`, `PUT` e `PATCH`: dry-run por padrão; execução real somente com `dry_run=false` e `confirmacao=IGOR_APROVA_EXECUCAO`.
- `DELETE`: execução real somente com `dry_run=false` e `confirmacao=IGOR_APROVA_DESTRUICAO`.
- Host, cabeçalhos de autenticação e tokens não podem ser definidos pelo chamador.
- Caminhos Hostinger precisam começar com `/api/`.
- Segredos encontrados em respostas são redigidos.

## Execução local

```bash
npm install
npm run check
ACTION_GATEWAY_TOKEN=... \
PETRA_GITHUB_TOKEN=... \
PETRA_HOSTINGER_TOKEN=... \
CLIENT_SLUG=petra-advocacia \
npm start
```

## Estado

Código preparado para revisão. Não significa que credenciais foram vinculadas, serviço foi implantado ou Actions foram cadastradas no GPT.
