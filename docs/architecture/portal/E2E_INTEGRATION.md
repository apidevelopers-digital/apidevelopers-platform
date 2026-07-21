# Integração ponta a ponta do Portal Projector

**Status:** teste estrutural adicionado  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Validar a composição completa:

1. transporte GitHub injetado;
2. provider GitHub somente leitura;
3. leitor fixado por commit;
4. pipeline documental;
5. parser Markdown;
6. extrator tipado;
7. integridade referencial;
8. fachada institucional.

## Cenários

- projeção institucional completa a partir de conteúdo Base64;
- presença dos oito tipos institucionais;
- coerência referencial `in_sync`;
- uso exclusivo de `GET`;
- uso do mesmo SHA em todas as requisições;
- repetibilidade determinística;
- falha fechada para árvore Git truncada.

## Limites

O teste usa transporte simulado e não contém credenciais, rede externa, escrita Git, merge, release ou deploy.

A validação sintática pode ser executada com:

`node --check packages/portal-projector/test/e2e-github-institutional.test.mjs`

A execução funcional exige um checkout completo do pacote:

`node --test packages/portal-projector/test/e2e-github-institutional.test.mjs`
