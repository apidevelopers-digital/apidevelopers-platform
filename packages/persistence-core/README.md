# @apidevelopers/persistence-core

Base canônica de persistência durável para a API Developers.digital.

## Responsabilidades

- persistir documentos JSON com checksum SHA-256;
- escrever de forma atômica usando arquivo temporário, `fsync` e `rename`;
- serializar transações concorrentes no processo;
- usar lock de arquivo para coordenação entre processos;
- detectar locks abandonados;
- aplicar concorrência otimista por revisão;
- executar trabalho idempotente dentro da mesma transação;
- manter outbox transacional para publicação posterior de eventos;
- oferecer repositório assíncrono por coleção;
- impedir valores que não possam ser representados em JSON;
- falhar de forma fechada em corrupção ou formato incompatível.

## Fronteiras

- este pacote fornece um adaptador durável local e os contratos operacionais;
- os domínios continuam donos de suas regras e modelos;
- `persistence-core` não conhece tenant, plano, billing ou Gateway;
- o adaptador JSON é adequado para desenvolvimento, instalações locais e operação single-node;
- produção multi-réplica exigirá adaptador SQL com as mesmas garantias;
- idempotência cobre apenas efeitos executados dentro da transação;
- publicação externa usa outbox e confirmação posterior.

## Garantias

Cada commit gera uma nova revisão persistida. Em falha durante o trabalho da transação, nenhuma escrita é efetuada. O arquivo contém envelope versionado e checksum do payload.

## Validação

```bash
npm --prefix packages/persistence-core run check
```
