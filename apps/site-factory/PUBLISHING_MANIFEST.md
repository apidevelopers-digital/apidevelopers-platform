# Manifesto canônico de publicação

Este contrato pertence à Onda 13 e à subfrente Site Factory GitHub-first.

## Objetivo

Descrever de forma pequena, auditável e independente de WordPress como uma aplicação é validada, promovida, publicada, verificada e revertida.

## Regras obrigatórias

- GitHub é a fonte de verdade.
- A publicação parte de branch e commit identificáveis.
- Preview é obrigatório antes da produção.
- Merge, deploy e rollback exigem aprovação explícita do Igor.
- Release e rollback são rastreados por commit.
- Segredos não são versionados.
- O runtime precisa declarar build/output ou entry/nodeVersion, conforme o tipo.
- Health check e checks mínimos são obrigatórios.

## Runtimes iniciais

- `static`
- `react-vite`
- `node-express`
- `api`
- `portal`

## Arquivos de referência

- `manifests/publishing-template.json`
- `manifests/apidevelopers-digital.github-first.json`
- `src/publishing-manifest.mjs`
- `test/publishing-manifest.test.mjs`

Esta etapa valida apenas o contrato. Não executa deploy, DNS, publicação ou escrita em produção.
