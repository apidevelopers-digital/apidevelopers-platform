# Instagram Stories Scheduler Publisher — integração preparada

## Objetivo

Conectar o plano salvo em `sitedauni.com/assets/campanhas/_instagram_scheduler/` a um publisher Meta seguro no backend institucional, sem expor token em PHP público.

## Escopo aprovado por Igor

- Publicar somente Stories.
- Não publicar feed.
- Não apagar mídias.
- Não mexer em anúncios.
- Rodar entre 2026-11-16 e 2026-11-22 às 08:30 America/Sao_Paulo.
- Gerar logs diários.
- Pausar ao final.
- Usar token Meta somente no backend seguro.

## Arquivo preparado

`apps/api-gateway/src/instagram-stories-scheduler-publisher.mjs`

O módulo exporta:

- `buildDailyStoryItems(plan, targetDate)`
- `runInstagramStoriesSchedule({ plan, targetDate, accessToken, dryRun })`
- `publishStoryItem(...)`
- `createInstagramStoryContainer(...)`
- `publishInstagramContainer(...)`

## Estado desta mudança

Esta alteração **prepara** a integração, mas não ativa cron, rota pública ou deploy.

A ativação real ainda exige uma camada runtime segura que:

1. leia o plano JSON salvo no site ou em storage institucional;
2. resolva o token Meta pelo backend seguro;
3. invoque `runInstagramStoriesSchedule` com `dryRun: false`;
4. persista logs de sucesso/falha;
5. aplique idempotência diária.

## Segurança

O módulo não contém tokens e não lê variáveis de ambiente diretamente. O token deve ser injetado por um provider institucional protegido.

## Próximo passo

Após revisão, criar rota interna controlada ou job do operador, por exemplo:

`instagram.scheduler.run`

Essa rota/job deve exigir confirmação operacional para ativação inicial e usar logs/auditoria institucional.
