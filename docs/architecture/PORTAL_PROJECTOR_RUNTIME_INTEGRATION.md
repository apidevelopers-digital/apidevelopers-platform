# Portal Projector — Integração de runtime somente leitura

## Estado

A integração do Portal Projector está preparada no código e testada em memória. Ela não é ativada automaticamente no runtime padrão e não publica endpoint em ambiente externo.

## Composição testada

1. projeção institucional derivada;
2. armazenamento derivado com leitor somente leitura;
3. API institucional de leitura;
4. adaptador HTTP;
5. autenticação por API key via registro do API Gateway;
6. autorização por scopes `portal:*:read`;
7. rate limit;
8. rota do API Gateway;
9. resposta HTTP JSON serializada.

O teste ponta a ponta está em:

`apps/api-gateway/test/portal-projector-runtime-e2e.test.mjs`

## Invariantes

- `mutationAllowed: false` na API e na rota;
- nenhuma função `publish`, `write`, `update`, `delete` ou mutation é exposta pela rota;
- o publisher do armazenamento derivado não é injetado no adaptador HTTP;
- somente métodos de leitura são aceitos;
- respostas usam `cache-control: private, no-store`;
- nenhuma API key real, credencial ou segredo é mantido no Git.

## Ativação

A rota só existe quando `createPortalProjectorGatewayRoute` ou `withPortalProjectorRoute` é chamado com dependências explicitamente injetadas:

- `readApi`;
- `apiKeyManager`;
- `rateLimiter` opcional;
- `adminKey` opcional.

Nenhuma composição é adicionada ao `app.mjs` padrão. Portanto, a integração permanece desabilitada por padrão e fora de live, staging, deploy e publicação.

## Evidência de continuidade

A composição real usa o contrato atual do `createClientRegistry`, que autentica chaves por `authenticate(rawKey)`, mantendo compatibilidade com gestores que exponham `resolveByRawKey(rawKey)`.

A conclusão desta frente exige que os workflows relevantes estejam verdes no SHA compartilhado.
