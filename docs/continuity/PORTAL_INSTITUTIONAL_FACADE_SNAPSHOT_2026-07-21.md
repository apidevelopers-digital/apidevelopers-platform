# Snapshot de continuidade — fachada institucional do Portal

**Data:** 2026-07-21  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-institutional-facade-20260721`  
**HEAD inicial:** `a3e34fdbdae4e349bebf1821009cdec9f98c94ff`

## Escopo

Foi criada uma fachada institucional somente leitura que compõe pipeline documental, extração tipada e integridade referencial.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `b12e56a8da98a3b0f2d69d5a825704e085f4c852` — implementação da fachada.
2. `6eb607b2b6d9a60e865ec475f9b2ebd464672126` — testes da fachada.

## Capacidades

- composição ordenada dos três estágios;
- verificação de commit em cada transição;
- rejeição de leitor com mutação permitida;
- falha fechada quando a integridade não está sincronizada;
- checksum SHA-256 da projeção institucional;
- interface somente leitura;
- adaptadores injetáveis para testes e evolução controlada.

## Testes

Comando local:

`node --test`

Resultado do lote:

- 7 testes;
- 7 aprovados;
- 0 falhas;
- 0 cancelados;
- 0 ignorados.

## Pendências

- provider GitHub concreto;
- armazenamento derivado;
- API HTTP de leitura;
- autenticação;
- workflow específico do pacote;
- release e deploy.

## Próximo passo exclusivo

Criar um provider GitHub somente leitura e fixado por commit, preservando o conector como porta externa e sem incluir qualquer operação de escrita.
