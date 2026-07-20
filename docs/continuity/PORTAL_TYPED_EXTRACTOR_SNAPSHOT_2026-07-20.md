# Snapshot de continuidade — extrator tipado do Portal

**Data:** 2026-07-20  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-typed-extractor-reanchor-20260720`  
**HEAD inicial reancorado:** `e5141722977bbe216faabc275753bc9015811ed3`

## Escopo

Foi implementada a extração tipada dos oito objetos institucionais a partir da projeção documental do Portal.

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits reancorados

1. `5a619507b037e3f1d0b8d7646fd292e187ecc73a` — extrator tipado institucional.
2. `ff34f466c4043e3591510323e08912678e930efa` — testes dos oito tipos.
3. `80156dfdd7ed9925d30367517061d6624fcf51c5` — exportação por subpath.
4. `6bd53e715207e9f105e03f90e53332f851ccd5b8` — contrato arquitetural.

## Capacidades

- reconhecimento fechado de `SourceRef`, `Node`, `Relation`, `Evidence`, `StateSnapshot`, `Iteration`, `Approval` e `AuditEvent`;
- validação mínima por tipo;
- preservação de `SourceRef`;
- rejeição de commits mistos;
- rejeição de identificadores duplicados;
- ordenação canônica;
- contagens por tipo;
- opção `requireAllTypes`;
- checksum SHA-256 da projeção lógica;
- preservação da posição original do bloco YAML como evidência;
- interface somente leitura.

## Testes

Comando local:

`node --test`

Resultado final:

- 8 testes;
- 8 aprovados;
- 0 falhas;
- 0 cancelados;
- 0 ignorados.

A suíte detectou antes da promoção:

1. validação incorreta de `scope` como string para `Iteration` e `Approval`;
2. expectativa de determinismo que descartava a posição auditável do bloco YAML.

Ambos os pontos foram corrigidos, e a suíte foi repetida com sucesso.

## Limites atuais

Ainda faltam:

- integridade referencial entre objetos tipados;
- provider GitHub concreto;
- armazenamento derivado;
- API HTTP de leitura;
- autenticação;
- workflow específico do pacote.

## Próximo passo exclusivo

Implementar reconciliação tipada e integridade referencial, validando relações, evidências, aprovações e eventos contra objetos existentes, sem escrita na fonte canônica.

## Segurança

Nenhum merge, release, deploy, force push, segredo ou credencial foi utilizado.
