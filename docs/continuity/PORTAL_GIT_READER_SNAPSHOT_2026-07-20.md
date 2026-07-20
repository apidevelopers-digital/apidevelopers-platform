# Snapshot de continuidade — leitor Git do Portal Projector

**Data:** 2026-07-20  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-git-reader-20260720`  
**HEAD inicial:** `e068a96379995050ef06de8a862af01db4c9d539`  
**Fonte de verdade:** Git

## Escopo

Foi adicionado ao pacote `packages/portal-projector` um adaptador Git somente leitura, fixado por commit e desacoplado de qualquer provider específico.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `31a0789ebccb26ed95870dbde89e97d155741aa0` — implementação do leitor Git fixado por commit.
2. `c5999411cb32883154971c5e03ba8ef6bd643207` — testes do leitor somente leitura.
3. `72e04854bc60a62ca02c20cf05eb261995d432dd` — exportação por subpath `./git-reader`.
4. `03c5e8a576ce15bdb915051bea330ed50104a29f` — documentação do contrato e uso.

## Capacidades implementadas

- exigência de SHA completo com 40 caracteres;
- encaminhamento imutável de `repository` e `commit` a todas as portas;
- leitura textual UTF-8 por `readBlob`;
- listagem por `listTree`;
- checksum SHA-256 do conteúdo lido;
- leitura múltipla com ordenação estável e deduplicação;
- rejeição de respostas provenientes de commit diferente;
- rejeição de caminhos absolutos, travessia, barras invertidas e byte nulo;
- rejeição de entradas fora do prefixo solicitado;
- interface explicitamente somente leitura;
- `mutationAllowed: false`;
- nenhuma função de escrita, commit, merge ou atualização de branch.

## Interface pública

Subpath:

`@apidevelopers/portal-projector/git-reader`

Função principal:

`createGitCommitReader({ repository, commit, readBlob, listTree })`

Saídas:

- `readText(path)`
- `readMany(paths)`
- `list(prefix)`
- `repository`
- `commit`
- `mutationAllowed: false`

## Testes

Comando local:

```text
node --test
```

Resultado do lote do adaptador:

- testes: 9;
- aprovados: 9;
- falhas: 0;
- cancelados: 0;
- ignorados: 0.

A suíte cobre SHA imutável, propagação do commit, checksum, commit misto, ordem estável, prefixo, segurança de caminhos, deduplicação e ausência de mutação.

## Limites atuais

Ainda não foram implementados:

- provider concreto para GitHub;
- resolução de branch para SHA;
- parser estrutural dos documentos Markdown;
- fixtures derivadas dos documentos reais;
- armazenamento derivado;
- transporte HTTP da API;
- autenticação;
- deploy ou release.

A resolução de branch, quando existir, deve ocorrer antes da criação do leitor e persistir o SHA completo. O leitor nunca acompanha HEAD móvel durante uma execução.

## Próximo passo exclusivo

Criar fixtures reais e um parser estrutural determinístico para os documentos do Portal, usando o leitor fixado por commit e sem escrita no Git.

## Segurança

Nenhum merge, release, deploy, publicação em produção, force push, segredo ou credencial foi utilizado.
