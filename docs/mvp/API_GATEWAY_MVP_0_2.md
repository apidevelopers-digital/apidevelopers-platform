# API Gateway MVP 0.2

## Estado

O gateway evoluiu para persistência local versionada, múltiplas API Keys por cliente, rotação, revogação, auditoria append-only e rate limiting.

## Runtime

Variáveis:

| Variável | Padrão | Uso |
|---|---|---|
| `API_GATEWAY_ADMIN_KEY` | sem padrão | chave administrativa injetada no runtime |
| `API_GATEWAY_CLIENT_STORE_PATH` | `./var/clients.json` | estado versionado dos clientes |
| `API_GATEWAY_AUDIT_LOG_PATH` | `./var/audit.jsonl` | auditoria append-only |
| `API_GATEWAY_MAX_ACTIVE_KEYS` | `5` | máximo de chaves ativas por cliente |
| `API_GATEWAY_RATE_LIMIT` | `120` | requisições por janela e identidade |
| `API_GATEWAY_RATE_WINDOW_MS` | `60000` | duração da janela |
| `API_GATEWAY_CLIENTS_JSON` | `[]` | seed/migração opcional |

Nenhuma credencial deve ser versionada.

## Rotas administrativas

| Método | Rota | Função |
|---|---|---|
| `GET` | `/v1/admin/status` | estado do armazenamento e total de clientes |
| `GET` | `/v1/admin/clients` | lista clientes e metadados públicos das chaves |
| `POST` | `/v1/admin/clients` | cria cliente e retorna a primeira chave uma única vez |
| `GET` | `/v1/admin/clients/{clientId}` | consulta cliente |
| `PATCH` | `/v1/admin/clients/{clientId}` | altera `active`, `suspended` ou `revoked` |
| `POST` | `/v1/admin/clients/{clientId}/keys` | emite nova chave; aceita `revokeExisting` |
| `DELETE` | `/v1/admin/clients/{clientId}/keys/{keyId}` | revoga chave específica |
| `GET` | `/v1/admin/audit` | lista eventos administrativos sanitizados |

## Persistência

O arquivo de clientes usa `schemaVersion: 2`, escrita em arquivo temporário e rename atômico. Somente hashes SHA-256 são persistidos. O formato legado com `apiKeyHash` é migrado no carregamento.

A auditoria usa JSONL append-only. Campos com nomes compatíveis com API key, autorização, senha, segredo, token, credencial ou chave privada são substituídos por `[REDACTED]`.

## Rate limiting

A janela fixa é aplicada por papel, identidade e grupo de rota. Respostas incluem:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`
- `retry-after` quando o limite é excedido

## Portal

`apps/developer-portal/public/admin.html` oferece cadastro, alteração de status, rotação, revogação e consulta de auditoria. A chave administrativa fica somente na memória da página.

## Validação

`npm --prefix apps/api-gateway run check`

A suíte cobre 12 cenários, incluindo persistência após reinício, migração, segurança dos hashes, auditoria sanitizada, rate limiting e servidor HTTP real.

## Gates

Sem merge, deploy, release, domínio, banco remoto ou credenciais reais.
