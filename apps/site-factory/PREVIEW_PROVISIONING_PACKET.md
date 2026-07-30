# Pacote canônico de criação do preview

Esta etapa pertence à **Onda 13** e transforma o pedido supervisionado incorporado pelo PR #97 em um artefato auditável gerado no runner institucional.

## Conteúdo do pacote

O workflow `Site Factory Preview Provisioning Packet`:

1. valida a Site Factory;
2. gera uma aplicação React/Vite isolada;
3. executa testes e build;
4. cruza o manifesto canônico com o snapshot Hostinger sanitizado;
5. gera plano, prontidão, pedido e pacote de provisionamento;
6. valida os bloqueios de segurança;
7. publica um artefato temporário associado ao SHA.

O pacote contém:

- `dist/`;
- `site-factory.manifest.json`;
- `promotion-plan.json`;
- `readiness-report.json`;
- `provisioning-request.json`;
- `provisioning-packet.json`;
- `summary.json`.

## Estado de segurança

O pacote mantém:

```text
mode: evidence-only
executable: false
approvalRequired: true
approvalScope: create-isolated-preview-web-app-only
```

Ele não:

- cria recurso na Hostinger;
- conecta repositório;
- configura domínio ou DNS;
- executa deploy;
- altera produção;
- modifica o WordPress atual.

A criação real da Web App continua sendo uma operação separada, sensível e condicionada ao token específico presente no pacote validado.

## Snapshot externo

O snapshot versionado contém apenas evidência sanitizada:

- plano Hostinger ativo;
- quatro websites inspecionados;
- nenhuma Web App de preview encontrada;
- nenhum registro `preview`, `preview-*` ou wildcard;
- identificadores mascarados;
- nenhum segredo.

O snapshot não substitui uma nova leitura imediatamente antes de eventual execução real.
