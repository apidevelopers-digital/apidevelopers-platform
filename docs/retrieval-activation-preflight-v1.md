# Retrieval Activation Preflight v1

**Status:** preparação segura; sem ativação de produção, sem deploy e sem leitura de conteúdo sensível.

## Objetivo

Validar se o runtime federado pode ser habilitado para um tenant sem tocar conteúdo real. O preflight é um gate anterior à ativação e nunca substitui autorização, política, aprovação humana ou auditoria do R5.

## Requisitos para `ready=true`

1. feature flag `retrievalEnabled=true`;
2. runtime de retrieval composto com `enabled=true` e `status=ready`;
3. kill-switch do tenant não bloqueando;
4. todos os provider probes saudáveis;
5. todos os probes declarados read-only;
6. nenhum segredo exposto;
7. nenhum corpo/anexo/conteúdo sensível lido durante o probe;
8. nenhuma escrita executada;
9. auditoria do próprio preflight disponível.

Se qualquer requisito falhar, o resultado é `ready=false` e a ativação permanece bloqueada.

## Kill-switch

O contrato existente `GlobalTrustKillSwitchState.enabled=true` é tratado como estado de bloqueio. O preflight não altera o kill-switch; apenas consulta o estado.

## Provider probe contract

Cada probe recebe somente `{ tenantId }` e deve retornar metadados operacionais:

```js
{
  ok: true,
  readOnly: true,
  secretsExposed: false,
  contentRead: false,
  writesPerformed: false,
  reason: null
}
```

O probe não deve buscar corpo de e-mail, mensagem, documento, processo, prontuário, anexo ou qualquer outro conteúdo do usuário.

## Auditoria

Evento:

`retrieval.activation.preflight`

A trilha contém somente tenant, timestamp, estado final, contagem de bloqueios e nomes lógicos dos providers. O contrato registra `sensitiveContentIncluded=false`.

Falha de auditoria bloqueia o preflight (`RETRIEVAL_PREFLIGHT_AUDIT_FAILED`).

## Relação com o runtime

O preflight é separado de `createRetrievalRuntime`.

- `createRetrievalRuntime` prepara a composição governada.
- `createRetrievalActivationPreflight` decide se a ativação é tecnicamente segura.
- nenhum deles faz deploy;
- nenhum deles liga a feature flag;
- nenhum deles faz merge;
- nenhum deles concede autorização R5.

## Sequência de ativação prevista

1. código mergeado e CI verde;
2. deploy explicitamente aprovado;
3. runtime ainda desativado;
4. executar preflight somente com probes sem conteúdo;
5. confirmar `ready=true`;
6. aprovação explícita para ativar feature flag em tenant controlado;
7. smoke test R2 somente read-only;
8. R5 continua exigindo aprovação por objeto/finalidade.

## Fontes inicialmente preparadas

- e-mail Peterle;
- WhatsApp UNICO/Zuni;
- Peterle/Mitra;
- document store/Drive e calendário quando seus probes reais estiverem disponíveis;
- imuni./EHR somente após probe clínico específico, sem dados de paciente.

## Não autorizado por este gate

- merge;
- deploy;
- ativação da feature flag;
- leitura de conteúdo real;
- abertura de anexo;
- gravação em prontuário;
- envio de mensagens;
- escrita em Drive/calendário/processos;
- alteração de kill-switch.
