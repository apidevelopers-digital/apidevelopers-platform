# Aprendizados — auth-core e integração com API Gateway

Data: 2026-07-23  
Branch: `work/auth-durable-security-20260723`

## Evidências confirmadas

- O gate isolado de `packages/auth-core` passou no run `29987389783`.
- O workflow completo `Auth Core CI` falhou após restaurar a integração com o Gateway.
- O workflow canônico `API Gateway MVP CI` também falhou na mesma branch.
- A preparação dos workspaces foi ampliada para incluir `portal-projector-http`.
- A falha permaneceu após a inclusão do workspace adicional.
- O workflow do Gateway foi dividido em etapas menores para tornar o diagnóstico acionável.
- O primeiro run instrumentado foi o `29988080741` e terminou em `failure`.

## Aprendizados operacionais

1. Um gate de pacote verde não comprova integração completa com o Gateway.
2. Workspaces locais precisam ser vinculados explicitamente no runner self-hosted.
3. Um único passo genérico de CI reduz a capacidade de diagnóstico.
4. Testes e verificações separados por domínio permitem localizar a primeira falha real.
5. Nenhuma causa deve ser declarada sem evidência do job ou da etapa correspondente.
6. Percentuais de progresso não substituem evidência técnica de CI.
7. O bloco `auth-core` só deve ser encerrado após validação do pacote e da integração aplicável.

## Estado atual

- `auth-core` isolado: validado.
- Integração com Gateway: pendente.
- CI diagnóstico do Gateway: instrumentado.
- Próxima ação: identificar a etapa exata do run `29988080741`, corrigir somente a causa comprovada e reexecutar.

## Commits relevantes

- `e0608840f4c4fdfb090531aa61e537f5d25021a6` — isola o gate do pacote.
- `5e1169defc9a5de4087f85f4c44740a82274d73f` — restaura integração com Gateway.
- `4ed6f54f871a0cea7c459518113e58dc74c1b588` — completa o conjunto de workspaces vinculados.
- `f7d34b5d56961ab045afc743e5d161219764f03c` — divide o CI do Gateway para diagnóstico.
