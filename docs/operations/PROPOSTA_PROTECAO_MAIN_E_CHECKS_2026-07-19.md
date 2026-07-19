# Proposta de proteção da `main` e checks obrigatórios

**Data:** 2026-07-19  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Estado:** PROPOSTA — NÃO APLICADA  
**Risco de aplicação:** R3  
**Decisão humana:** obrigatória

## Objetivo

Impedir promoção acidental, force-push, deleção e integração de código sem evidência técnica, preservando a autoridade humana sobre merge, release e deploy.

## Estado observado

- `main` não está protegida;
- branch de fundação: `foundation/global-platform-bootstrap-20260715`;
- PR #1 permanece em `draft`;
- repositório permanece privado;
- runner validado: `igor-mac-runner`;
- check consolidado validado: `Platform CI / validate`;
- publishers e workflows diagnósticos históricos continuam ativos, mas não devem ser obrigatórios nesta fase.

## Regra proposta para `main`

Configurar uma branch rule ou ruleset com:

1. exigir pull request antes de merge;
2. exigir pelo menos 1 aprovação humana;
3. invalidar aprovações quando novos commits forem enviados;
4. exigir resolução de todas as conversas;
5. exigir branch atualizada com `main` antes do merge, quando disponível no plano;
6. exigir o status check `Platform CI / validate`;
7. bloquear force-push;
8. bloquear deleção da branch;
9. não permitir bypass automático;
10. aplicar a regra também ao administrador, salvo recuperação de emergência formalmente registrada.

## Check obrigatório recomendado

Somente:

```text
Platform CI / validate
```

Motivo:

- é o gate consolidado da plataforma;
- inclui contratos, kernels, integrações, auditoria institucional e `auth → tenancy`;
- já passou no runner self-hosted;
- reduz risco de travar a `main` por workflows diagnósticos ou publishers legados;
- mantém uma única fonte técnica de verdade para promoção.

## Checks informativos, não obrigatórios

- `Auth CI`;
- `Tenancy CI`;
- `Auth Tenancy Integration CI`;
- gates dedicados de kernels e contratos;
- workflows diagnósticos;
- `Runner Smoke CI`.

Eles permanecem úteis para diagnóstico, mas não devem bloquear a `main` enquanto houver dependência do runner local e workflows históricos ainda não normalizados.

## Workflows que não devem ser obrigatórios

- `Wave 3 atomic publisher`;
- `Wave 4 atomic publisher`;
- `Wave 5 atomic publisher`;
- `Wave 5 atomic publish trigger`;
- qualquer workflow de publicação, promoção, release ou deploy.

Esses fluxos exigem auditoria específica e aprovação explícita antes de qualquer uso real.

## Ordem segura de aplicação

1. confirmar que `Platform CI / validate` aparece como check no PR #1;
2. manter PR #1 em `draft`;
3. aplicar proteção sem habilitar auto-merge;
4. validar que push direto e force-push estão bloqueados;
5. validar que o PR continua sem possibilidade de merge enquanto o check estiver ausente;
6. registrar evidência da configuração;
7. somente depois solicitar decisão humana sobre retirar o draft e promover.

## Rollback da configuração

Se a proteção bloquear recuperação legítima:

1. não desativar toda a proteção;
2. registrar motivo e risco;
3. remover temporariamente apenas o requisito impeditivo;
4. executar correção em branch;
5. restaurar a regra;
6. anexar evidência no registro institucional.

## Bloqueios

Esta proposta não autoriza:

- aplicar proteção;
- atualizar o PR;
- retirar o modo draft;
- executar merge;
- criar tag ou release;
- publicar pacote;
- executar deploy;
- disparar publisher.

## Aprovação exigida

Para aplicação real, registrar confirmação explícita contendo:

```text
IGOR APROVA A PROTEÇÃO DA MAIN COM PLATFORM CI / VALIDATE E 1 REVISÃO HUMANA
```
