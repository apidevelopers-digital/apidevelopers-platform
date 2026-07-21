# @apidevelopers/persistence-core

Base canônica de persistência durável para a API Developers.digital.

## Responsabilidades

- persistir documentos JSON com checksum SHA-256;
- executar transações atômicas;
- aplicar concorrência otimista por revisão;
- executar trabalho idempotente dentro da mesma transação;
- manter outbox transacional;
- oferecer repositório assíncrono por coleção;
- falhar de forma fechada em corrupção ou formato incompatível;
- impedir valores que não possam ser representados em JSON.

## Adaptadores

### JSON file

`createJsonFileStore` atende desenvolvimento, instalações locais e operação single-node.

Garantias:

- arquivo temporário, `fsync` e `rename`;
- serialização dentro do processo;
- lock entre processos;
- detecção de lock abandonado;
- checksum do envelope persistido.

### PostgreSQL

`createPostgresStore` atende produção multi-réplica por meio de um pool PostgreSQL injetado.

Garantias:

- tabela e schema com identificadores validados;
- inicialização idempotente com `CREATE TABLE IF NOT EXISTS`;
- isolamento `SERIALIZABLE`;
- `pg_advisory_xact_lock` por namespace;
- leitura transacional com `SELECT ... FOR UPDATE`;
- revisão otimista também verificada no `UPDATE`;
- rollback integral em falha;
- checksum SHA-256 do payload JSONB;
- idempotência e outbox na mesma transação;
- mapeamento de serialization failure (`40001`) e deadlock (`40P01`) para conflito retryable;
- nenhum armazenamento de URL, senha, token ou segredo de conexão.

## Contrato do driver PostgreSQL

O pool deve expor:

```text
pool.connect() -> client
client.query(sql, params)
client.release()
```

A biblioteca `pg`, um proxy compatível ou um adaptador interno podem implementar esse contrato. O domínio não cria conexões diretamente e não recebe credenciais.

## Exemplo estrutural

```js
const store = createPostgresStore({
  pool,
  namespace: "tenant-123",
  schema: "platform",
  tableName: "durable_state",
});

await store.transaction((tx) => {
  tx.put("projects", "project-1", { id: "project-1" });
  tx.enqueueOutbox({
    id: "event-1",
    type: "project.created",
    aggregateId: "project-1",
  });
});
```

## Fronteiras

- os domínios continuam donos de suas regras e modelos;
- `persistence-core` não conhece tenant, plano, billing ou Gateway;
- publicação externa usa outbox e confirmação posterior;
- o adaptador PostgreSQL não executa migrations destrutivas;
- operação real depende de pool configurado pela camada de infraestrutura.

## Validação

```bash
npm --prefix packages/persistence-core run check
```
