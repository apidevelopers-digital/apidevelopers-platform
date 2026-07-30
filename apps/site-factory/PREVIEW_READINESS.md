# Prontidão externa do preview — dry-run

Esta etapa pertence à **Onda 13** e cruza o plano auditável de promoção com um snapshot somente leitura da hospedagem.

## Resultado

O relatório informa:

- repositório, SHA e artefato de origem;
- domínio e health check de preview;
- presença e estado da Web App na Hostinger;
- bloqueios objetivos;
- ações que ainda exigem aprovação;
- fingerprint SHA-256 da conferência.

## Segurança

O relatório mantém:

```text
mode: external-readiness-dry-run
readyForApply: false
writesEnabled: false
deployEnabled: false
dnsEnabled: false
```

Nenhuma ação sugerida é executável pelo relatório. Criar Web App, habilitar aplicação, conectar commit, implantar ou alterar DNS continuam exigindo aprovação explícita e operação separada.

O snapshot da Hostinger deve ser obtido pelo adapter institucional somente leitura. Segredos, tokens e variáveis de ambiente não entram no relatório.
