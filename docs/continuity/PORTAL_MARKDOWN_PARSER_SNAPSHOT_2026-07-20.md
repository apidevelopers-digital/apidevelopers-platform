# Snapshot de continuidade — parser Markdown do Portal Projector

**Data:** 2026-07-20  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-markdown-parser-20260720`  
**HEAD inicial:** `878cd3ba4b37afd08255d410aee6cf44f22ec9b6`  
**Fonte de verdade:** Git

## Escopo

Foi adicionado ao pacote `packages/portal-projector` um parser Markdown determinístico para os documentos arquiteturais do Portal.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `95c8521802cf484630a4e5bae8b0030eb74cb419` — parser Markdown determinístico.
2. `6f6b0e8eaf73d9cf7647f3f98e1110ec25b77c18` — fixture derivada do documento real.
3. `fffc33c9120a3e88ad27b7011d0222585099ea25` — testes do parser e links.
4. `f343ac94d087d79bd1759e69e41d8294ca4f6487` — exportação por subpath.
5. `2eada174e7dda79c508d2ab651a922c1cc491213` — documentação.

## Capacidades implementadas

- entrada fixada por path, commit SHA completo e conteúdo UTF-8;
- normalização de quebra de linha;
- exatamente um título de nível 1;
- headings com nível, linha e anchor determinístico;
- links Markdown relativos;
- code fences com linguagem e linhas;
- subconjunto YAML deliberadamente restrito;
- rejeição de chaves YAML duplicadas, tabs e sintaxe ambígua;
- validação de links internos contra paths do mesmo commit;
- nenhuma escrita no Git;
- fixtures identificadas como derivadas, não canônicas.

## Interface pública

Subpath:

`@apidevelopers/portal-projector/markdown-parser`

Funções:

- `parsePortalMarkdown`
- `parseSimpleYaml`
- `validateInternalMarkdownLinks`

## Testes

Comando local:

`node --test`

Resultado do novo lote:

- testes: 7;
- aprovados: 7;
- falhas: 0;
- cancelados: 0;
- ignorados: 0.

## Limites atuais

O parser não pretende implementar Markdown ou YAML completos. Ele cobre apenas o subconjunto canônico necessário à arquitetura do Portal e falha fechado para estruturas não suportadas.

Ainda faltam:

- pipeline que combine leitor Git, parser e núcleo do projetor;
- extração tipada dos oito objetos do modelo;
- provider concreto de leitura GitHub;
- armazenamento derivad;
- API HTTP de leitura;
- workflow específico do pacote.

## Próximo passo exclusivo

Criar o	pipeline documental que leia os arquivos do Portal em um único commit, aplique o parser, valide links internos e produza uma projeção documental reconstruível, sem escrever na fonte canônica.

## Segurança

Nenhum merge, release, deploy, publicação em produção, force push, segredo ou credencial foi utilizado.
