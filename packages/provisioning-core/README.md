# @apidevelopers/provisioning-core

Domínio canônico de orquestração do provisionamento automático da API Developers.digital.

## Responsabilidades

- consumir somente assinaturas `active`;
- criar uma solicitação idempotente por assinatura;
- controlar os estados `requested`, `running`, `completed`, `failed` e `cancelled`;
- coordenar tenant, projeto e API Key em ordem determinística;
- expor apenas `id` e `prefix` da API Key, nunca o segredo;
- manter snapshots imutáveis, revisões sequenciais e histórico append-only;
- deduplicar eventos externos por `sourceEventId`;
- registrar tentativas, falhas e possibilidade de recuperação;
- gerar compensações em ordem reversa para recursos parcialmente criados;
- bloquear nova tentativa até concluir todas as compensações;
- emitir eventos canônicos para onboarding, portal e operação.

## Fronteiras

- `subscription-core` confirma que a assinatura está ativa.
- `tenant-core` cria o tenant em `provisioning` e posteriormente o ativa.
- `project-core` cria o projeto em `provisioning` e posteriormente o ativa.
- `apikey-core` gera a chave, armazena somente hash e devolve o segredo uma única vez ao adaptador seguro.
- `provisioning-core` registra apenas o identificador e o prefixo público da chave.
- `persistence-core` fornecerá o adaptador durável.
- Adaptadores externos executam os efeitos; este pacote mantém a máquina de estados e o plano de compensação.

## Eventos

- `provisioning.requested`
- `provisioning.started`
- `provisioning.tenant.completed`
- `provisioning.project.completed`
- `provisioning.apikey.completed`
- `provisioning.completed`
- `provisioning.failed`
- `provisioning.compensation.completed`
- `provisioning.compensation.failed`
- `provisioning.retry.requested`
- `provisioning.cancelled`

## Validação

```bash
npm --prefix packages/provisioning-core run check
```
