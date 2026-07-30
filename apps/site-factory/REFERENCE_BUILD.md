# Build de referência da Site Factory

Esta etapa pertence à **Onda 13** e comprova que o template reutilizável consegue produzir um projeto React/Vite funcional no runner institucional.

## Fluxo validado

```text
contrato canônico
→ geração em diretório temporário
→ verificação do manifesto
→ instalação de dependências
→ testes
→ build
→ evidência
→ artefato
```

## Segurança

O workflow:

- usa `self-hosted`, `macOS` e `X64`;
- escreve somente em `$RUNNER_TEMP`;
- não acessa DNS;
- não publica na Hostinger;
- não altera `apidevelopers.digital`;
- não lê segredos de produção;
- não executa merge ou rollback;
- retém o artefato por sete dias.

## Evidência esperada

O artefato contém:

- `dist/`;
- `publishing-manifest.json`;
- `reference-build-evidence.json`.

A promoção para preview ou produção continua bloqueada por aprovação explícita separada.
