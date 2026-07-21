# Portal Institucional — Fase 0

Shell estático, especializado e somente leitura dentro de `apps/developer-portal`.

## Entrypoint

`public/institutional.html`

## Contratos consumidos

- `GET /v1/portal/snapshot`
- `GET /v1/admin/learning`

Ambas as chamadas passam pelo API Gateway. A chave informada pela pessoa operadora permanece apenas em memória durante a página atual; não há `localStorage`, `sessionStorage`, cookies próprios ou persistência no cliente.

## Invariantes

- nenhuma mutação;
- nenhuma aprovação ou execução;
- nenhum acesso direto a banco, broker, provider ou projetor;
- erro de política não vira estado vazio;
- falta de permissão não revela objetos protegidos;
- propostas pendentes aparecem como `Não aprovada`;
- versão, origem e possível defasagem permanecem visíveis quando fornecidas.

## Validação

```bash
npm --workspace @apidevelopers/developer-portal run check
```
