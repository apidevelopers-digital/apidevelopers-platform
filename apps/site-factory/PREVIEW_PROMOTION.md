# Promoção para preview — dry-run

Esta etapa pertence à Onda 13 e conecta o artefato validado ao próximo estágio de homologação sem executar publicação.

O plano produzido contém:

- repositório, SHA e nome do artefato;
- domínio de preview;
- health check;
- checks obrigatórios;
- política de aprovação explícita;
- fingerprint SHA-256 auditável.

O contrato permanece bloqueado:

- `mode: dry-run`
- `readyForApply: false`
- `writesEnabled: false`
- `deployEnabled: false`
- `dnsEnabled: false`

Nenhum deploy, DNS, alteração Hostinger ou publicação é executado nesta etapa.
