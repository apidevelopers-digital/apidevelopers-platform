# Imuni MCP v1 — Continuidade Operacional

Data: 2026-11-07  
Responsável operacional: ADA  
Produto: Imuni  
Domínio: imuni.sitedauni.com  
Runtime MCP: `mcp-api` em `/opt/api-dev-brain/apps/mcp-brain-v1`  
Status: `active_v1`

## Resumo

O MCP Imuni v1 foi instalado e validado no runtime vivo do MCP Brain na VPS `srv2028303.hstgr.cloud`.

O namespace ativo é:

```text
imuni.*
```

Tools instaladas:

```text
imuni.status
imuni.config.check
imuni.readiness.report
imuni.clinical.boundary
imuni.encounter.draft
imuni.red_flags.check
imuni.prescription.draft
imuni.audit.log
```

## Estado final validado

- MCP health: online.
- Catálogo MCP: 162 tools.
- `imuni.status`: ok.
- `imuni.config.check`: ok.
- `imuni.clinical.boundary`: ok.
- `imuni.readiness.report`: ok.
- `imuni.red_flags.check`: ok após patch v2.
- Registro do produto: `registry/products/imuni.json`.
- Governança clínica: `registry/operations/imuni-governance-v1.json`.
- Smoke test: `registry/operations/imuni-smoke-test-v1.json`.

## Guardrails ativos

O Imuni MCP v1 opera com:

- `draft_no_persist` como modo padrão;
- sem diagnóstico autônomo;
- sem prescrição autônoma;
- sem escrita clínica;
- sem persistência de prontuário;
- sem exposição de `.env`, tokens ou segredos;
- sem log de narrativa clínica bruta;
- revisão humana/profissional obrigatória;
- auditoria apenas de metadados operacionais.

Flags finais:

```text
production_writes_enabled: false
clinical_writes_enabled: false
clinical_data_persisted: false
secret_value_exposed: false
human_review_required: true
```

## Governança v1

Registro operacional:

```text
/opt/api-dev-brain/registry/operations/imuni-governance-v1.json
```

Status:

```text
active_v1
```

Gates antes de qualquer persistência clínica:

```text
LGPD review
professional identity gate
patient/responsible consent model
audit log persistence design
access control / tenant + patient scoping
retention policy
rollback/correction policy
human signoff
```

## Smoke test v1.1

Registro operacional:

```text
/opt/api-dev-brain/registry/operations/imuni-smoke-test-v1.json
```

Status final:

```text
passed_v1
```

### Caso testado

Texto sintético, sem paciente real:

```text
Paciente adulto relata febre há 2 dias, tosse seca, dor no corpo e cansaço.
Nega falta de ar, dor no peito, desmaio, confusão, sangramento intenso ou rigidez de nuca.
```

Resultado final esperado e validado após patch v2:

```text
detected_red_flags: []
urgent_human_review_required: false
negation_patch_version: v2
```

## Bug corrigido

Durante o smoke test foi identificado falso positivo em `imuni.red_flags.check`.

### Problema

A versão inicial marcava termos como presentes mesmo quando o texto dizia explicitamente:

```text
Nega falta de ar, dor no peito...
```

### Correção

Foram aplicados dois patches no arquivo:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py
```

Backups:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107020123
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107020248
```

O patch v2 adicionou reconhecimento de negação em lista no escopo da sentença.

## Arquivos alterados no runtime

Arquivos principais aplicados na VPS:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/site_media_tools.py
/opt/api-dev-brain/apps/mcp-brain-v1/app/entrypoint.py
```

Backups relevantes:

```text
/opt/api-dev-brain/backups/operator/20261107012656-before-imuni-mcp-v1-tools.tar.gz
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/site_media_tools.py.bak.20261107012754
/opt/api-dev-brain/apps/mcp-brain-v1/app/entrypoint.py.bak.20261107013707
```

## Observação sobre fonte GitHub

Foram conferidos os repositórios separados:

```text
apidevelopers-digital/api-dev-brain
apidevelopers-digital/mcp-brain-v1
```

Eles não existem ou não estão acessíveis pelo token no momento desta operação.

O repositório institucional usado para continuidade é:

```text
apidevelopers-digital/apidevelopers-platform
```

Este documento não inclui segredos, `.env`, tokens ou payloads clínicos reais.

## Pendências

1. Criar caminho canônico de source control para o runtime MCP Brain.
2. Versionar código fonte completo do runtime sem `.env` u sem backups temporários.
3. Separar patches MCP em módulos revisáveis.
4. Criar testes automatizados para `imuni.red_flags.check`.
5. Criar CI de validação de tools MCP.
6. Definir política formal LGPD antes de qualquer persistência clínica.
7. Definir gate de identidade profissional antes de escrita clínica.
8. Definir modelo de consentimento do paciente/responsável antes de prontuário.

## Próximo passo recomendado

Abrir uma etapa dedicada para versionar o código runtime do MCP Brain de forma controlada, sem importar arquivos sensíveis, e sem depender apenas de alterações manuais na VPS.
