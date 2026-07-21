# Documento supersedido — não promover

**Status:** corrigido por mudança de direção e precedência canônica  
**Branch:** `work/portal-surface-topology-20260721`

## Motivo

A versão anterior descrevia vários portais administrativos como produtos separados. A direção confirmada é reduzir superfícies e operar uma **plataforma única**, com módulos, tenants, papéis e permissões.

## Regra válida

O escopo deve ser modelado dentro do Portal unificado por:

- tenant;
- organização;
- usuário;
- papel;
- capacidade;
- ambiente;
- produto;
- recurso;
- gate;
- política de evidência.

Uma visão de cliente, desenvolvedor, atendimento, financeiro ou operação não cria automaticamente outro portal nem outra autoridade.

## Gate

- não promover a versão anterior;
- não tratar visões como sistemas administrativos independentes;
- reutilizar identidade, autorização, auditoria e componentes comuns;
- manter isolamento de clientes e princípio do menor privilégio.
