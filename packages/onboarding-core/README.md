# @apidevelopers/onboarding-core

Domínio canônico da primeira jornada do cliente da API Developers.digital.

## Responsabilidades

- consumir somente `activation.completed`;
- criar um onboarding idempotente por ativação;
- confirmar conta, workspace, API Key pública, documentação e primeiro teste;
- armazenar apenas `apiKeyId` e `prefix`, nunca o segredo;
- exigir um primeiro teste concluído com sucesso antes do encerramento;
- manter snapshots imutáveis, revisões sequenciais e histórico append-only;
- deduplicar eventos externos por `sourceEventId`;
- permitir falha, retry seguro e cancelamento terminal;
- emitir eventos canônicos para Portal, suporte e operação;
- bloquear tokens, senhas, API Keys em texto puro, cartões e credenciais.

## Ordem canônica

```text
activation.completed
  → account confirmed
  → workspace ready
  → API Key ready
  → documentation opened
  → first test requested
  → first test completed successfully
  → onboarding completed
```

## Fronteiras

- `activation-core` confirma que a compra, a assinatura e o provisionamento terminaram.
- `tenant-core` e `project-core` mantêm os recursos canônicos.
- `apikey-core` emite a chave uma única vez e persiste somente seu hash.
- `usage-core` registra a chamada usada como primeiro teste.
- `onboarding-core` registra apenas referências públicas e coordena a jornada.
- Adaptadores externos executam efeitos; este pacote não envia mensagens, não cria recursos e não chama provedores.

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

## Validação

```bash
npm --prefix packages/onboarding-core run check
```
