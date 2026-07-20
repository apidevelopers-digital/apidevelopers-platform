# @apidevelopers/usage-core

Domínio canônico de medição de uso da API Developers.digital.

## Responsabilidades

- registrar eventos de consumo de forma append-only;
- impedir dupla contagem por chave de idempotência;
- relacionar consumo a tenant, projeto, API Key, API e operação;
- consultar eventos por período e dimensões;
- agregar quantidade e contagem de eventos;
- emitir `usage.recorded` somente na primeira gravação;
- oferecer contrato de repositório substituível e adaptador em memória.

## Fronteiras

- `usage-core` mede consumo, mas não calcula preço;
- `billing-core` transformará consumo agregado em cobrança;
- `plan/limits` definirá franquias e excedentes;
- `project-core` e `tenant-core` validam a existência e operação dos recursos;
- `apikey-core` continua responsável pelo segredo, status e rotação das chaves.

As janelas usam intervalo semiaberto: `from <= occurredAt < to`.

## Validação

```bash
npm --prefix packages/usage-core run check
```
