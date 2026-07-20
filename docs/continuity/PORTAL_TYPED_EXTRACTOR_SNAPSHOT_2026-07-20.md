# Snapshot de continuidade — extrator tipado do Portal

**Data:** 2026-07-20  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-typed-extractor-20260720`  
**HEAD inicial:** `ca2d28c81bbcd28dd4391c4c58f0014c69c7bf63`

## Escopo

Foi implementada a extração tipada dos oito objetos institucionais a partir da projeção documental do Portal.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `7fdefd64918a31c861a5d1b495c1565834f8c026` — extrator tipado inicial.
2. `9f2d5e50c1064da57f08aef5818fdbeab7ec4121` — testes iniciais dos oito tipos.
3. `cb1114b5aa9ca4c219d7cf0220c320c1a9d15365` — correção da validação de escopos como listas.
4. `0b9a11a424f5cc39d1fdcc4e5f4771c080ff589c` — alinhamento do teste de determinismo à ordem auditável.

## Capacidades

- reconhecimento fechado de oito tipos;
- validação mínima por tipo;
- preservação de `SourceRef`;
- bloqueio de commit misto;
- bloqueio de IDs duplicados;
- ordenação canônica;
- contagens por tipo;
- exigência opcional dos oito tipos;
- SHA-256 da projeção lógica;
- interface somente leitura.

## Testes

Comando local:

`node --test`

Resultado após correções:

- 8 testes;
- 8 aprovados;
- 0 falhas;
- 0 cancelados;
- 0 ignorados.

Durante o lote, a suíte detectou duas inconsistências antes da promoção: validação incorreta de `scope` como string e uma expectativa de determinismo que descartava a posição auditável do bloco. Ambas foram corrigidas e novamente testadas.

## Limites atuais

Ainda faltam:

- integridade referencial entre objetos tipados;
- provider GitHub concreto;
- armazenamento derivado;
- API HTTP de leitura;
- autenticação;
- workflow específico do pacote.

## Próximo passo exclusivo

Implementar reconciliação tipada e integridade referencial: relações devem apontar para nós existentes, evidências para sujeitos existentes e eventos/aprovações para ações coerentes, sem escrita canônica.
