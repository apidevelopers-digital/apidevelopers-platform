# @apidevelopers/platform-core

Contratos transversais do Platform Core.

## Responsabilidades

- contexto imutável de requisição;
- normalização de headers e `requestId`;
- erro tipado `PlatformError`;
- envelope JSON uniforme para sucesso e falha;
- ocultação de detalhes internos em erros `5xx`.

## Formato de erro

```json
{
  "error": "resource_not_found",
  "message": "Resource not found.",
  "requestId": "..."
}
```

O pacote não conhece rotas, banco, autenticação ou catálogo. Essas responsabilidades ficam nos demais núcleos.
