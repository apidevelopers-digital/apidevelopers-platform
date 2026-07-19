# Política de promoção, rollback e runner

**Data:** 2026-07-19  
**Estado:** PROPOSTA OPERACIONAL  
**Produção:** não configurada

## Princípio

CI valida. Humano decide. Promoção executa somente após aprovação explícita.

## Fluxo de promoção

```text
branch de trabalho
→ PR em draft
→ revisão técnica
→ Platform CI / validate
→ aprovação humana
→ retirada do draft
→ merge autorizado
→ tag opcional autorizada
→ release opcional autorizada
→ deploy separado e autorizado
```

Nenhuma etapa posterior é inferida automaticamente da anterior.

## Runner atual

- nome: `igor-mac-runner`;
- labels: `self-hosted`, `macOS`, `X64`;
- finalidade: CI e testes;
- não é servidor de produção;
- não deve armazenar segredos permanentes;
- deve permanecer ligado e com o listener ativo durante os jobs;
- deve ser removido ou rotacionado se a máquina for perdida, vendida ou comprometida.

## Restrições do runner

1. não executar workflows de forks não confiáveis;
2. não disponibilizar segredos a pull requests externos;
3. não misturar runner com produção;
4. não habilitar deploy automático;
5. não executar publishers antigos sem auditoria;
6. limpar artefatos temporários após jobs;
7. manter macOS, Node.js e runner atualizados;
8. usar conta local sem privilégios administrativos permanentes sempre que possível.

## Continuidade

Se o Mac estiver offline:

- os jobs ficam em fila;
- isso não autoriza trocar para runner pago;
- isso não autoriza tornar o repositório público;
- isso não autoriza ignorar checks;
- a promoção deve aguardar o runner ou infraestrutura substituta aprovada.

## Futuro com VPS

Uma VPS poderá hospedar CI permanente quando houver necessidade operacional. Regras:

- runner de CI separado de produção;
- usuário dedicado;
- acesso SSH por chave;
- firewall mínimo;
- atualizações automáticas de segurança;
- backups e logs;
- nenhum segredo em repositório;
- custo aprovado antes da contratação.

## Rollback técnico

1. identificar commit causador;
2. bloquear promoção;
3. abrir branch de reversão;
4. adicionar teste de regressão;
5. executar Platform CI;
6. aprovar e mesclar o rollback por PR;
7. registrar evidência.

Force-push na `main` não é método de rollback.

## Emergência

Uma exceção exige:

- risco documentado;
- decisão humana explícita;
- escopo mínimo;
- tempo limitado;
- evidência;
- restauração imediata das proteções.

## Autoridade

- Milena: decisão quando aplicável;
- Igor: execução quando explicitamente autorizada;
- uni. Operador: preparação, validação e evidência, sem autoridade autônoma para promoção.
