# Criação supervisionada da Web App de preview

Esta etapa pertence à **Onda 13** e transforma a evidência de prontidão externa em um pedido de criação estritamente delimitado.

## Escopo único

O pedido autoriza, após aprovação explícita e em operação separada, somente:

```text
create_preview_web_app
```

O pedido não autoriza:

- conexão do repositório ou commit;
- configuração de domínio ou DNS;
- deploy do artefato;
- promoção para produção;
- alteração do domínio principal;
- alteração ou remoção do WordPress atual;
- rollback.

Cada ação posterior permanece separada e exige nova conferência e nova aprovação.

## Contrato de segurança

O objeto produzido mantém:

```text
mode: supervised-request
executable: false
approvalRequired: true
approvalScope: create-isolated-preview-web-app-only
```

Também fixa as invariantes:

- domínio principal preservado;
- WordPress atual preservado;
- nenhum overwrite de DNS;
- nenhum wildcard DNS;
- nenhum deploy durante a criação;
- nenhuma escrita em produção;
- rollback por commit obrigatório antes de promoção.

## Evidência exigida

O gerador rejeita o pedido quando:

- o plano de promoção não é `dry-run`;
- qualquer escrita, deploy ou DNS está habilitado;
- o domínio diverge entre promoção e prontidão;
- a Web App de preview já existe;
- o relatório não contém o bloqueio `preview_web_app_not_found`;
- a ação de criação não está marcada como sensível, bloqueada e sujeita à aprovação;
- o SHA diverge;
- já existe registro DNS de preview.

O pedido recebe um fingerprint SHA-256 e um token de aprovação específico:

```text
IGOR_APROVA_CRIACAO_WEBAPP_PREVIEW_<12_HEX>
```

O token identifica apenas a criação isolada da Web App. Ele não autoriza conexão, DNS ou deploy.

## Contexto confirmado em 2026-07-30

- provedor: Hostinger;
- plano: `hostinger_business_v3`;
- pedido de hospedagem ativo;
- quatro websites inspecionados;
- nenhuma Web App de preview encontrada;
- nenhum registro `preview`, `preview-*` ou wildcard encontrado;
- domínio alvo: `preview-apidevelopers.apidevelopers.digital`.

Nenhuma ação real de hospedagem é executada por este módulo.
