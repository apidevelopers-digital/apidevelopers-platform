# Ponte uni. Operador ↔ Hostinger

## Objetivo

Conectar a Site Factory à ação direta Hostinger já disponível no uni. Operador, sem copiar o token da Hostinger para o GitHub.

## Fluxo

```text
manifesto versionado no GitHub
            ↓
uni. Operador
            ↓
ação direta Hostinger
            ↓
snapshot redigido em memória
            ↓
Site Factory planner
```

## Contrato

A ação direta retorna os payloads de websites e instalações WordPress. O adaptador:

1. localiza o domínio solicitado;
2. confirma se o website está habilitado;
3. confirma se existe instalação WordPress válida;
4. reduz os dados ao mínimo operacional;
5. marca o snapshot como `read-only`;
6. bloqueia qualquer indicação de escrita.

O snapshot não contém username, login, e-mail, IDs, caminhos absolutos, token ou segredo.

## Responsabilidades

| Componente | Responsabilidade |
|---|---|
| GitHub | código, manifesto, CI, revisão e histórico |
| uni. Operador | invocação da ação direta e auditoria |
| Hostinger direct action | acesso autenticado à infraestrutura |
| WordPress adapter | descoberta e inventário REST |
| Planner | `create`, `update` e `noop` sem aplicar |

## Limite atual

A ação direta confirma a hospedagem e a instalação WordPress, mas o conector ainda não expõe autenticação temporária para a REST API WordPress. Até essa capacidade existir, o relatório mantém os bloqueadores:

- `wordpress_authentication_not_validated`;
- `wordpress_page_inventory_not_loaded`.

Nenhum fallback por automação visual é permitido.
