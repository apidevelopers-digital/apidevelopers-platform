# Template reutilizável GitHub-first

Esta entrega pertence à **Onda 13** e transforma o contrato canônico em um projeto React/Vite gerável.

## Segurança

O comando padrão é `dry-run`. Nenhum arquivo é escrito sem `--apply`.

O gerador:

- aceita apenas nomes `kebab-case`;
- valida domínio público;
- bloqueia o uso da raiz do sistema como saída;
- cria somente um diretório novo e isolado;
- recusa sobrescrita;
- grava arquivos com modo exclusivo;
- não executa `npm install`, build, deploy, DNS ou publicação;
- não lê nem grava segredos.

## Planejar

```bash
npm run project:plan -- \
  --app institutional-preview \
  --domain preview.apidevelopers.digital \
  --title "API Developers.digital" \
  --output /tmp/site-factory-projects
```

## Gerar localmente

A escrita local continua sendo uma ação controlada:

```bash
npm run project:generate -- \
  --app institutional-preview \
  --domain preview.apidevelopers.digital \
  --title "API Developers.digital" \
  --output /tmp/site-factory-projects
```

O projeto produzido inclui React/Vite, manifesto canônico, teste de fumaça, preview obrigatório, aprovação explícita e rollback por commit.

Esta etapa não cria repositório, não publica na Hostinger e não altera `apidevelopers.digital`.
