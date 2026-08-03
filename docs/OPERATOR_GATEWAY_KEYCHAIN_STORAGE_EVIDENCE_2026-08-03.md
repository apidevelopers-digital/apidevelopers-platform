# Operator Gateway — evidência de armazenamento da chave no macOS Keychain

**Data:** 2026-08-03  
**Status:** armazenamento real confirmado; cópia temporária `.pem` ainda pendente de remoção  
**Fonte de verdade:** `apidevelopers-digital`

## Confirmado

- arquivo temporário localizado em `~/Downloads/api-devs-operator-gateway-pilot.2026-08-03.private-key.pem`;
- tamanho validado: `1675 bytes`;
- destino previamente livre no macOS Keychain;
- helper nativo compilado a partir de `apidevelopers-platform@63460d0d6a3eb82cc971f60a16ef2c4a5f0cbaf7`;
- protocolo: `operator-keychain-helper.v1`;
- service: `digital.apidevelopers.operator-gateway`;
- account: `github-app-private-key`;
- política: `create-only`;
- escopo: `current-user`;
- resposta sanitizada observada:
  - `created: true`;
  - `replaced: false`;
  - `secretReturned: false`;
- verificação adicional com `security find-generic-password` concluiu com sucesso;
- mensagem final observada: `VERIFICADO: item criado no Keychain sem exibir o segredo`.

## Segurança

- nenhum conteúdo PEM foi exibido no chat, commit, PR, log ou artefato;
- nenhum token foi emitido;
- a GitHub App ainda não foi instalada;
- nenhuma alteração em Hostinger, DNS, deploy ou produção foi executada.

## Autorizações

A autorização `IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN` foi consumida nesta operação, porque houve gravação real e verificação do item no macOS Keychain.

## Pendente

- remover a cópia temporária `.pem` de Downloads após conferência final;
- instalar a App somente nos repositórios autorizados;
- emitir installation token temporário;
- executar o piloto real read-only;
- registrar observabilidade, expiração, revogação e rollback.
