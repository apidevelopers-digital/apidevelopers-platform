# Integridade referencial tipada do Portal

**Status:** implementação inicial testada  
**Fonte de verdade:** Git  
**Escrita canônica:** proibida

## Objetivo

Validar a coerência entre os objetos institucionais extraídos da projeção documental, sem corrigir silenciosamente a fonte e sem introduzir estado paralelo.

## Validações

- `Relation.from` e `Relation.to` apontam para `Node` existente;
- `Evidence.subject_id` aponta para identificador presente na projeção;
- `StateSnapshot.head` coincide com o commit fixado;
- ações autorizadas e proibidas de `Iteration` não se sobrepõem;
- `AuditEvent.approval_id` aponta para `Approval` existente;
- `AuditEvent.action_id` coincide com a ação da aprovação vinculada;
- `AuditEvent.evidence_id` aponta para `Evidence` existente;
- todos os records preservam o mesmo commit em `SourceRef`;
- IDs duplicados no mesmo tipo são rejeitados.

## Interface

Subpath:

`@apidevelopers/portal-projector/typed-integrity`

Funções:

- `reconcileTypedIntegrity(typedProjection, options)`
- `createPortalTypedIntegrityValidator(options)`

Por padrão, qualquer divergência falha de forma fechada. Com `failOnError: false`, o validador retorna diagnóstico ordenado com `status`, `findingCount` e `findings`.

## Invariantes

1. O validador é somente leitura.
2. Nenhuma inconsistência é corrigida automaticamente.
3. A saída diagnóstica é determinística.
4. O Git permanece fonte canônica.
5. O validador não cria commits, não promove branches e não publica projeções.

## Limites atuais

A validação de `action_id` é limitada à coerência entre `Approval` e `AuditEvent`, pois `Action` ainda não é um dos oito objetos tipados. Persistência derivada, API HTTP, autenticação, release e deploy continuam fora deste módulo.
