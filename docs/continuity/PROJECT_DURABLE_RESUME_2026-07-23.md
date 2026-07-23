# Continuidade — Retomada do Project Durable Core

**Data:** 2026-07-23  
**Status:** BLOCO_CONCLUIDO_CI_VERDE  
**Repositório:** `apidevelopers-digital/apidevelopers-platform`  
**Branch:** `work/resume-project-durable-core-20260723`  
**Base:** `ca64fde8e34bf39a6ae78821841b4dbe6123ea21`  
**HEAD validado:** `29d30f325fce9bf3b678111fb536448ca1e7ad28`

## Objetivo

Retomar a evolução da persistência durável do domínio `project-core`, preservando a arquitetura existente, o método de microcommits, o registro de erros e a separação entre falhas de infraestrutura, CI, harness, testes e componente.

## Estado final do bloco

- `@apidevelopers/project-core` possui contratos síncronos e assíncronos.
- `createAsyncProjectService()` foi validado em fluxo completo.
- criação, ativação, recuperação por slug e listagem por tenant/status passaram.
- `createDurableProjectRepository()` foi validado contra `@apidevelopers/persistence-core`.
- instalação e resolução do workspace passaram no runner autohospedado.
- sintaxe, contratos principais, fluxo assíncrono, persistência durável e boundaries de tenant passaram.
- o workflow integral foi restaurado.
- CI final verde no run `29983715297`.

## Evidências principais

| Evidência | Resultado |
|---|---|
| Run de instalação isolada `29981860392` | success |
| Run de sintaxe `29982122221` | success |
| Run de contratos principais `29982858832` | success |
| Run de criação assíncrona `29983085790` | success |
| Run de ativação corrigida `29983301316` | success |
| Run assíncrono completo `29983574879` | success |
| Run durável `29983611443` | success |
| Run integral final `29983715297` | success |

## Correções e aprendizados

### 1. Rótulo do runner

O workflow exigia `[self-hosted, macOS, X64]`, mas os runners disponíveis não assumiam o job com o rótulo arquitetural `X64`.

Correção aplicada:

```yaml
runs-on: [self-hosted, macOS]
```

Aprendizado:

> runner online não garante compatibilidade de rótulo; fila e indisponibilidade devem ser diferenciadas de falha do código.

### 2. Harness de diagnóstico

Uma auditoria temporária chamou `activateProject()` com `{tenantId, projectId}`, embora o contrato canônico exija apenas `projectId`.

Correção:

```js
await service.activateProject(created.project.id)
```

Aprendizado:

> harnesses e auditorias também são software e podem introduzir falhas próprias; não devem ser confundidos com defeito do componente.

### 3. `Array.map(structuredClone)`

O teste canônico usava:

```js
.map(structuredClone)
```

No Node 22, `Array.map()` transmite valor, índice e array ao callback. Esses argumentos extras vazavam para `structuredClone`, quebrando a listagem.

Correção:

```js
.map((project) => structuredClone(project))
```

Aprendizado:

> funções nativas não devem ser passadas diretamente como callback quando aceitam argumentos opcionais incompatíveis com a assinatura de `Array.map`.

## Microcommits relevantes

- `7509650fc75b2c1a67a391348d7d9a2bb28deacb` — registrar diagnóstico inicial.
- `36b6f83b5c6d5fe103d2ef82d8ceaa95873c30bd` — permitir runner macOS autohospedado.
- `8a99889f5c0f98ea8dda02a48d4d8bd1e771c0fb` — isolar instalação.
- `40426cecbff0c43b88c35328b7032c5adad98fc3` — isolar validação do pacote.
- `0e77ab43cd91a8f30d5f2faae3f1904b257b6aa5` — isolar sintaxe.
- `da9b74a05118c809bd7af8dd52671ddf406f1a38` — isolar contratos principais.
- `7926a3aa6206b0c282822b613f2da0fb6a7b1c74` — isolar serviço assíncrono.
- `bed3d4b50aacdf565ad0672502c704c10e6958fe` — auditar criação.
- `84eb72592c5d212a762e8dcfd4e1d895558f2013` — auditar ativação.
- `3869e160187831c66fb4ea1e911b9ffe3946678b` — corrigir input do harness.
- `d602ed20b7c14524355af7836074abdbd004eae6` — restaurar CI integral.
- `b6a73e57aacab9c2e72174054095bf48fecdfa92` — corrigir clone na listagem.
- `7906ba04342959aa3f7c23e902824db73dae71a1` — validar repositório durável.
- `29d30f325fce9bf3b678111fb536448ca1e7ad28` — restaurar e validar CI completo.

## Estado de governança

| Ação | Estado |
|---|---|
| alteração de `main` | NÃO_EXECUTADA |
| merge | NÃO_EXECUTADO |
| deploy | NÃO_EXECUTADO |
| publicação de pacote | NÃO_EXECUTADA |
| alteração de arquitetura | NÃO_EXECUTADA |
| branch de trabalho | preservada |
| evidência de CI | registrada |

## Percentuais ao fechar o bloco

- `project-core`: **100% do bloco de retomada planejado**
- sessão de retomada: **100%**
- indústria cognitiva multiagente geral: **60% estimados**

O percentual geral é conservador e inclui, além do código já existente, a necessidade de integração real entre persistência, orchestration, runtime, gateway, provisionamento, billing, segurança multi-tenant, observabilidade e operação automática.

## Próximo bloco recomendado

Consolidar a próxima camada de identidade operacional:

1. auditar `api-key` / `api-key-core`;
2. confirmar contratos de persistência e rotação;
3. validar revogação e isolamento por tenant;
4. integrar com `persistence-core`;
5. executar CI segmentado;
6. registrar continuidade;
7. sem merge e sem deploy.

Alternativa, se a ordem institucional vigente priorizar domínios-base: revisar primeiro `tenant-core` e `user-core` contra o mesmo padrão durável já validado em `project-core`.
