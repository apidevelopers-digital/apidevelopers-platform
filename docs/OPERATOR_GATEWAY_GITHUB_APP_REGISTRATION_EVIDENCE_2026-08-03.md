# Operator Gateway — regularização da GitHub App piloto criada manualmente

**Data:** 2026-08-03  
**Status:** evidência preparada; App criada, não instalada e sem operação real  
**Fonte de verdade:** `apidevelopers-digital`

## Confirmado

- nome visível: `API Devs Operator Gateway Pilot`;
- App ID: `4474490`;
- proprietária: `apidevelopers-digital`;
- a GitHub App foi criada manualmente;
- a interface mostrou `7 selected` permissões de repositório e `1 mandatory`;
- Igor confirmou que as permissões configuradas correspondem ao escopo read-only aprovado;
- uma chave privada foi gerada pela interface;
- nenhum conteúdo da chave privada foi registrado no GitHub;
- a App ainda não foi instalada;
- nenhum installation token foi emitido;
- nenhum piloto real foi executado.

## Escopo read-only registrado

- `actions: read`;
- `administration: read`;
- `checks: read`;
- `commit_statuses: read`;
- `contents: read`;
- `issues: read`;
- `metadata: read`;
- `pull_requests: read`.

Permissões de organização, conta e enterprise permanecem vazias. Webhooks e eventos permanecem desativados.

## Sequência e autorizações

A criação da App e a geração da chave ocorreram manualmente antes do consumo da autorização dedicada de criação.

Portanto:

- `IGOR_APROVA_CONFIGURAR_GITHUB_APP_PILOTO`: consumida para orientar a configuração;
- `IGOR_APROVA_CRIAR_GITHUB_APP_PILOTO`: não consumida;
- `IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN`: não consumida;
- autorização de instalação: não consumida;
- autorização do piloto real read-only: não consumida.

Nenhuma autorização é retroativa.

## Segurança

O repositório registra apenas metadados não sensíveis. Não registra:

- chave privada;
- conteúdo PEM;
- client secret;
- token;
- installation token;
- `.env`;
- credencial Hostinger;
- qualquer outro segredo.

## Próximo passo

Validar e incorporar esta evidência à `main`. Depois, localizar o arquivo `.pem` exclusivamente no Mac e preparar seu armazenamento controlado no macOS Keychain, sem exibir ou copiar o conteúdo no chat.
