# Site Factory API — foundation

Primeiro incremento da fábrica institucional de sites da API Developers.digital.

## Estado

- inventário Hostinger somente leitura;
- descoberta pública da WordPress REST API;
- autenticação técnica por Application Password ou JWT emitido pela Hostinger ;
- inventário autenticado das päginas;
- plano declarativo `create`, `update` cil `noop`;
- nenhuma rota de escrita, publicação, exclusão ou DNS.

## Estrutura

- `apps/site-factory`: manifesto, orquestração e relatório de dry-run;
- `packages/hostinger-adapter`: endpoints oficiais Hostinger somente `GET`;
- `packages/wordpress-adapter`: endpoints WordPress somente `GET`;
- `manifests/apidevelopers-institution.json`: primeira instância declarativa.

## Execução segura

Validar somente o manifesto:

```bash
npm run dry-run -- --manifest-only
```

Descobrir apenas a API pública do WordPress:

```bash
node src/cli.mjs \
  --manifest manifests/apidevelopers-institution.json \
  --public-only
```

Dry-run autenticado:

```bash
HOSTINGER_API_TOKEN='***' \
node src/cli.mjs \
  --manifest manifests/apidevelopers-institution.json \
  --output /tmp/site-factory-dry-run.json
```

Quando a Hostinger não puder emitir o JWT do WordPress, usar variáveis externas:

```bash
WORDPRESS_USERNAME='factory-user' \
WORDPRESS_APPLICATION_PASSWORD='***' \
node src/cli.mjs \
  --manifest manifests/apidevelopers-institution.json
```

## Segurança

- segredos nunca integram manifestos, relatórios ou logs;
- relatórios gravados pelo CLI usam modo `0600`;
- o foundation increment aceita páginas apenas como `draft`;
- não existem métodos `POST`, `PUT`, `PATCH` ou `DELETE`;
- publicação depende de incremento posterior, revisão e aprovação explícita.
