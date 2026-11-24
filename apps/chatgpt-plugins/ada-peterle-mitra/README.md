# ada-peterle-mitra

Status: draft  
Risco: alto  
Modo padrão: read-only / dry-run

## Escopo

Plugin/conector para a frente Peterle / Milena / Peter Advocacia, incluindo Mitra, HomoSapiens e banco de clientes/documentos usado pela Milena.

## Entrada canônica

| Campo | Valor |
|---|---|
| Produto/domínio | Peterle / Milena / Peter Advocacia |
| Banco | `u398929082_clientes` |
| Tenant Hostinger | `peterle` / `u398929082` |
| Domínios | `peterle.adv.br`, `mitra-api.peterle.adv.br`, `clientes.homosapiens.id` |
| Plugin destino | `ada-peterle-mitra` |
| Risco | Alto |
| Modo padrão | read-only / dry-run |
| Escrita/envio/deploy | somente com confirmação explícita |

## Subáreas

- `peterle.clients`
- `peterle.documents`
- `peterle.matters`
- `milena.product`
- `mitra.runtime`
- `homosapiens.interfaces`

## Componentes confirmados

- `peterle-ops.apidevelopers.digital`
- `mitra-api.peterle.adv.br`
- `peterle.adv.br`
- `clientes.homosapiens.id`
- `app.homosapiens.id`
- `lex.homosapiens.id`
- `biblioteca.homosapiens.id`
- `chefsapiens.homosapiens.id`
- `sensus.homosapiens.id`
- `visio.homosapiens.id`
- `intuitus.homosapiens.id`
- `littera.homosapiens.id`
- `vita.homosapiens.id`

## Banco principal

- Database: `u398929082_clientes`.
- Uso: clientes, aliases, documentos, objetos, bindings, matters e eventos de auditoria.
- Não registrar segredos no GitHub.

## Regras de segurança

1. Não expor dados de clientes por padrão.
2. Consultas devem ser read-only, com limite.
3. Escritas devem começar em dry-run.
4. Envio de e-mail exige confirmação explícita.
5. Deploy/alteração de runtime exige confirmação explícita.
6. Ações destrutivas exigem conferência, backup e confirmação forte.

## Pendências

- OpenAPI específico.
- Lista de operações permitidas.
- DNS do tenant Peterle/Milena.
- NodeJS builds de `app.homosapiens.id` e `lex.homosapiens.id`.
- Crons/jobs do tenant `u398929082`.
- Bancos adicionais, se existirem.
- Confirmação de GitHub/instalação separada para Peterle/Milena.
