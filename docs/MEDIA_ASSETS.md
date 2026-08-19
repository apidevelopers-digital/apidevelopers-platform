# Mídia canônica

A fábrica e as superfícies da plataforma devem usar a biblioteca institucional:

`apidevelopers-digital/apidevelopers-media-assets`

Contrato canônico:
`MEDIA_ASSET_CONTRACT.md` no repositório acima.

## Bridge operacional da Site Factory

A integração executável fica em `apps/site-factory/src/media-assets-*.mjs`.

Fluxo:

`arquivo gerado → SHA-256 → busca global → reutilização ou candidato novo → branch determinística → Draft PR → revisão → merge aprovado`

O comando padrão é:

```bash
cd apps/site-factory

GITHUB_TOKEN=... npm run media:intake -- \
  --source /caminho/imagem.webp \
  --surface public-site \
  --collection factory \
  --date AAAA-MM-DD \
  --role reference \
  --slug nome-estavel \
  --source-type openai-generated \
  --provenance "Imagem gerada pela ADA para a fábrica"
```

Sem `--apply`, o comando é somente leitura/dry-run. Com `--apply`, ele pode criar/reutilizar uma branch e abrir um Draft PR no repositório de mídia. Ele **não faz merge nem publica em produção**.

## Regra ADA / fábrica

Uma imagem institucional que exista apenas na conversa, cache ou screenshot ainda não está preservada. Antes de tratá-la como reutilizável, registrar o arquivo no acervo canônico.

Se o SHA-256 já existir, reutilizar o caminho existente. Não criar cópia física.

Se um caminho canônico já estiver ocupado por outro conteúdo, falhar fechado. Não sobrescrever.

Nunca colocar token, credencial, URL assinada ou segredo em manifesto, log ou saída.
