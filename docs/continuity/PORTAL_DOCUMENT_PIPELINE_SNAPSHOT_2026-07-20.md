# Snapshot de continuidade — pipeline documental do Portal

**Data:** 2026-07-20  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-document-pipeline-20260720`  
**HEAD inicial:** `0cc8b3c7b308959ce8090278cbf9113ab5b7d10d`

## Escopo

Foi criado o pipeline documental reconstruível em `packages/portal-projector`, combinando leitor Git, parser Markdown e projeção determinística.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `5ae11bc7f9f97d9802e367023621c13dc518e07a` — pipeline documental reconstruível.
2. `2a7131765c0a160a186c783ff4d0b3da807199cd` — testes do pipeline.
3. `95aae4d92a45f2854c0c1edba4e57de449e7a59d` — exportação por subpath.

## Capacidades

- leitura de todos os documentos do Portal em um único commit;
- prefixes explícitos e seguros;
- ordenação e deduplicação determinísticas;
- parsing estrutural;
- validação de links internos;
- records `portal_document` com `SourceRef`;
- checksum SHA-256 da projeção lógica;
- falha fechada para conjunto vazio, commit misto ou links inválidos;
- interface somente leitura.

## Testes

Comando local:

`node --test`

Resultado do lote:

- 7 testes;
- 7 aprovados;
- 0 falhas;
- 0 cancelados;
- 0 ignorados.

## Limites atuais

- provider GitHub concreto ainda ausente;
- extração tipada dos oito objetos ainda ausente;
- armazenamento derivado e API HTTP ainda ausentes;
- nenhum workflow específico, release ou deploy foi criado.

## Próximo passo exclusivo

Implementar a extração tipada dos oito objetos do modelo institucional a partir da projeção documental, preservando `SourceRef`, determinismo e ausência de escrita canônica.
