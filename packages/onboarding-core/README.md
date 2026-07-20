# @apidevelopers/onboarding-core

Domínio canônico da primeira jornada do cliente na API Developers.digital.

## Responsabilidades

- consumir somente `activation.completed`;
- criar uma jornada idempotente por ativação;
- controlar os estados `requested`, `running`, `completed`, `failed` e `cancelled`;
- coordenar conta confirmada, workspace disponível, API Key, documentação e primeiro teste;
- armazenar apenas `apiKeyId` e `prefix`, nunca o segredo da API Key;
- manter snapshots imutáveis, revisões sequenciais e histórico append-only;
- deduplicar eventos por `sourceEventId`;
- suportar retry seguro e cancelamento terminal;
- emitir eventos canônicos sem executar envio, provisionamento ou integração externa.

## Etapas canônicas

1. conta confirmada;
2. tenant disponível;
3. projeto disponível;
4. API Key emitida;
5. API Key visualizada ou entrega segura registrada;
6. documentação aberta;
7. primeiro teste solicitado;
8. primeiro teste concluído.

## Eventos

- `onboarding.requested`
- `onboarding.started`
- `onboarding.account.confirmed`
- `onboarding.workspace.ready`
- `onboarding.apikey.ready`
- `onboarding.documentation.opened`
- `onboarding.first_test.requested`
- `onboarding.first_test.completed`
- `onboarding.completed`
- `onboarding.failed`
- `onboarding.retry.requested`
- `onboarding.cancelled`

## Fronteiras

- `activation-core` confirma a ativação comercial.
- `tenant-core` e `project-core` fornecem identidade do workspace.
- `apikey-core` emite a credencial; `onboarding-core` guarda apenas ID e prefixo.
- `usage-core` confirma o primeiro teste bem-sucedido.
- `persistence-core` será adaptado fora do domínio.
- Portal self-service e adaptadores externos ficam fora deste pacote.

## Validação

```bash
npm --prefix packages/onboarding-core run check
```
