# Site Factory — live dry-run

## Escopo

Este incremento executa apenas leitura contra:

- Hostinger `GET /api/hosting/v1/websites`;
- Hostinger `GET /api/hosting/v1/wordpress/installations`;
- Hostinger `GET /api/hosting/v1/accounts/{username}/wordpress/{software}/jwt-token`;
- WordPress `GET /wp-json/`;
- WordPress `GET /wp-json/wp/v2/users/me`;
- WordPress `GET /wp-json/wp/v2/pages`.

## Modos

`public` descobre a REST API sem segredo. `authenticated` inventaria a hospedagem, obtém JWT temporário, valida a identidade técnica e gera o diff das páginas.

O modo autenticado depende do environment `site-factory-readonly` e do secret `HOSTINGER_API_TOKEN`.

## Garantias

- nenhuma rota de escrita;
- nenhuma publicação;
- nenhuma exclusão;
- nenhuma alteração de DNS;
- relatórios sem tokens, IDs internos, usuário de hospedagem, identidade administrativa ou conteúdo bruto;
- `readyForApply` permanece `false`;
- qualquer escrita exigirá incremento separado e aprovação explícita.
