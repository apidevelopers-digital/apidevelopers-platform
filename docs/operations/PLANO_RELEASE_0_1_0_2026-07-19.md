# Plano de release institucional `0.1.0`

**Data:** 2026-07-19  
**Estado:** PLANO — RELEASE NÃO AUTORIZADO  
**Versão proposta:** `0.1.0`  
**Distribuição atual:** privada

## Objetivo

Definir uma primeira linha de base institucional sem publicar pacotes, executar deploy ou expor APIs antes de decisão humana.

## Escopo técnico proposto

Pacotes privados em `0.1.0`:

- `@apidevelopers/auth`;
- `@apidevelopers/contracts`;
- `@apidevelopers/kernel-audit`;
- `@apidevelopers/kernel-constitution`;
- `@apidevelopers/kernel-decision`;
- `@apidevelopers/kernel-evidence`;
- `@apidevelopers/kernel-evolution`;
- `@apidevelopers/kernel-governance`;
- `@apidevelopers/kernel-memory`;
- `@apidevelopers/kernel-planning`;
- `@apidevelopers/kernel-policy`;
- `@apidevelopers/kernel-reasoning`;
- `@apidevelopers/kernel-reflection`;
- `@apidevelopers/kernel-runtime`;
- `@apidevelopers/registry`;
- `@apidevelopers/tenancy`.

## Pré-condições de release

Todas devem ser verdadeiras no mesmo commit:

1. `main` protegida;
2. PR aprovado por humano autorizado;
3. `Platform CI / validate` verde;
4. diff completo revisado;
5. ausência de segredos e material sensível confirmada;
6. inventário e reancoragem atualizados;
7. decisão explícita sobre estratégia de merge;
8. decisão explícita sobre tag;
9. decisão explícita sobre publicação privada ou ausência de publicação;
10. plano de rollback confirmado.

## Estratégia proposta

### Merge

Preferência: **squash merge**, porque a branch contém muitos commits incrementais e diagnósticos.

O commit final deve:

- preservar autoria institucional;
- mencionar PR #1;
- registrar âncora técnica;
- não disparar deploy;
- não publicar pacotes automaticamente.

### Tag

Tag proposta somente após merge validado:

```text
v0.1.0
```

A criação da tag não deve disparar publicação ou deploy sem aprovação adicional.

### Release notes

Conteúdo mínimo:

- cadeia governada completa;
- contratos públicos;
- `auth` deny-by-default;
- isolamento estrito de tenancy;
- evidência e auditoria;
- runner self-hosted;
- limitações conhecidas;
- nenhuma garantia de produção até ambiente operacional aprovado.

## Publicação de pacotes

Estado recomendado nesta fase:

```text
private: true
publish: blocked
```

Não publicar no npm ou GitHub Packages antes de:

- definir política de acesso;
- decidir escopo público/privado;
- configurar proveniência;
- revisar licença;
- validar versionamento semântico;
- aprovar credenciais e registry.

## Compatibilidade

- Node.js mínimo: 22;
- módulos ES;
- contratos versionados;
- breaking changes exigem nova decisão;
- integrações externas permanecem fora do release inicial.

## Rollback

Se o merge produzir regressão:

1. bloquear novas promoções;
2. criar branch de reversão;
3. executar `Platform CI / validate`;
4. reverter por PR, nunca por force-push;
5. registrar causa e evidência;
6. não reutilizar tag publicada; emitir nova versão corretiva quando autorizada.

## Bloqueios

Este plano não autoriza:

- merge;
- tag;
- GitHub Release;
- npm publish;
- GitHub Packages;
- deploy;
- mudança de visibilidade;
- habilitação de auto-merge.

## Aprovações futuras separadas

A proteção da `main`, o merge, a tag, o release e a publicação são decisões distintas. Uma aprovação não implica as demais.
