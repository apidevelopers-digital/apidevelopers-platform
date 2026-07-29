# Site Factory — execução somente leitura

## Controle de execução

A arquitetura institucional separa os planos:

- **GitHub**: código, manifestos, testes, revisão e sondagem pública;
- **uni. Operador**: orquestração operacional e auditoria;
- **ação direta Hostinger**: inventário autenticado da hospedagem e das instalações WordPress.

O token da Hostinger permanece encapsulado no conector direto do uni. Operador. Ele não deve ser duplicado em GitHub Secrets para esta frente.

## GitHub Actions

O workflow `site-factory-live-dry-run.yml` executa somente:

- testes dos adaptadores;
- validação do planner;
- descoberta pública `GET /wp-json/`;
- geração de relatório público redigido.

O workflow não recebe credencial Hostinger e não executa inventário autenticado.

## Ponte uni. Operador

`packages/uni-operator-hostinger-adapter` recebe, em memória, as respostas das ações diretas:

- listagem de websites;
- listagem de instalações WordPress.

O adaptador remove antes do planejamento:

- IDs internos;
- usuário da hospedagem;
- login e e-mail WordPress;
- caminhos absolutos;
- identificadores de cliente e pedido;
- qualquer segredo.

`apps/site-factory/src/uni-operator-bridge.mjs` converte o snapshot redigido para o contrato do planner.

## Estado de autenticação WordPress

O inventário Hostinger direto está disponível. A leitura autenticada das páginas WordPress continua bloqueada até que o conector do uni. Operador exponha uma credencial temporária ou operação equivalente para a REST API WordPress.

## Garantias

- nenhuma rota de escrita;
- nenhuma publicação;
- nenhuma exclusão;
- nenhuma alteração de DNS;
- nenhum deploy;
- nenhuma credencial em GitHub, artifact ou relatório;
- `readyForApply` permanece `false`;
- qualquer escrita exige incremento separado e aprovação explícita.
