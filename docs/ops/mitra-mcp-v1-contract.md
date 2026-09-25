# Mitra MCP v1 — Contrato técnico inicial

Status: rascunho operacional
Data: 2026-09-25
Repositório de registro: `apidevelopers-digital/apidevelopers-platform`

## Objetivo

Definir o primeiro contrato técnico do Mitra MCP v1 antes da implementação.

O Mitra MCP v1 será a interface de ferramentas para ChatGPT e clientes compatíveis com MCP. Ele não deve duplicar backend jurídico, nem substituir a Skill jurídica, nem armazenar segredo em chat, logs, commits ou artefatos.

## Decisão

A Mitra será implementada em arquitetura MCP-first:

```txt
ChatGPT / Milena / cliente
→ Mitra MCP
→ Skill jurídica Mitra
→ ADA/Gateway
→ Mitra Legal Orchestrator
→ Lex Legal API
→ fontes oficiais, casos e documentos autorizados
```

## Responsabilidades

| Camada | Responsabilidade |
|---|---|
| Mitra MCP v1 | Expor ferramentas, schemas, autenticação e auditoria de chamadas |
| Skill jurídica Mitra | Método de trabalho jurídico, estilo, cautelas, revisão humana e não invenção |
| ADA/Gateway | Tenants, scopes, API keys, secrets, validação e segurança institucional |
| Mitra Legal Orchestrator | Orquestração de caso, análise, tese, minuta e Veritas |
| Lex Legal API | Jurisprudência, fontes oficiais, legislação, LexML e DataJud quando configurado |
| Plataforma pública | Clientes, usuários, casos, documentos, billing, permissões e conexão MCP |

## Regras de não duplicação

- Pesquisa jurídica deve usar Lex Legal API.
- Orquestração de caso deve usar Mitra Legal Orchestrator.
- Credenciais, tenants e secrets devem usar ADA/Gateway.
- O MCP não deve recriar serviços jurídicos nem manter uma base paralela.
- A Skill não deve chamar dados reais sem ferramenta MCP.
- Plataforma pública não deve pedir ao cliente para copiar token técnico em operação normal.

## Autenticação e scopes

O MCP deve receber uma autorização vinculada a tenant/usuário. A autorização deve ser validada pelo backend institucional antes de chamar ferramentas.

Escopos iniciais sugeridos:

```txt
mitra:status:read
mitra:capabilities:read
mitra:jurisprudencia:read
mitra:fontes:read
mitra:processos:read
mitra:casos:read
mitra:documentos:read
mitra:analise:run
mitra:minutas:generate
mitra:veritas:run
mitra:admin
```

A versão v1 deve começar com ferramentas read-only e análise assistida. Ferramentas destrutivas ou que pratiquem ato jurídico ficam fora do v1.

## Ferramentas MCP v1

### `mitra.status`

Confirma disponibilidade do MCP, tenant e gateway.

Input:

```json
{}
```

Output:

```json
{
  "ok": true,
  "service": "mitra-mcp",
  "tenantId": "string",
  "timestamp": "ISO-8601"
}
```

Backend alvo: ADA/Gateway  
Escopo: `mitra:status:read`

### `mitra.capabilities`

Lista ferramentas e limites disponíveis para o tenant.

Input:

```json
{}
```

Output:

```json
{
  "ok": true,
  "tools": ["mitra.status", "mitra.buscar_jurisprudencia"],
  "limits": {}
}
```

Backend alvo: ADA/Gateway + configuração do tenant  
Escopo: `mitra:capabilities:read`

### `mitra.buscar_jurisprudencia`

Busca jurisprudência em fontes configuradas.

Input:

```json
{
  "query": "string",
  "jurisdiction": "string optional",
  "court": "string optional",
  "dateFrom": "YYYY-MM-DD optional",
  "dateTo": "YYYY-MM-DD optional",
  "limit": 10
}
```

Output:

```json
{
  "ok": true,
  "results": [
    {
      "title": "string",
      "court": "string",
      "date": "YYYY-MM-DD optional",
      "summary": "string",
      "sourceUrl": "string optional",
      "sourceType": "official|provider|unknown"
    }
  ],
  "source": "lex-legal-api"
}
```

Backend alvo: Lex Legal API  
Escopo: `mitra:jurisprudencia:read`

Regras:
- não inventar jurisprudência;
- informar indisponibilidade quando Lex não retornar fonte suficiente;
- priorizar fontes oficiais.

### `mitra.pesquisar_fontes_oficiais`

Pesquisa legislação, LexML, Planalto, Senado, STJ ou fontes oficiais configuradas.

Input:

```json
{
  "query": "string",
  "source": "lexml|planalto|senado|stj|all",
  "limit": 10
}
```

Output:

```json
{
  "ok": true,
  "results": [
    {
      "title": "string",
      "source": "string",
      "summary": "string",
      "sourceUrl": "string optional"
    }
  ]
}
```

Backend alvo: Lex Legal API  
Escopo: `mitra:fontes:read`

### `mitra.buscar_processo`

Consulta metadados públicos de processo quando fonte configurada permitir.

Input:

```json
{
  "numeroCnj": "string"
}
```

Output:

```json
{
  "ok": true,
  "numeroCnj": "string",
  "metadata": {},
  "source": "datajud|provider|unknown"
}
```

Backend alvo: Lex Legal API / DataJud  
Escopo: `mitra:processos:read`

### `mitra.contexto_cliente`

Recupera contexto autorizado de cliente/caso.

Input:

```json
{
  "clientId": "string optional",
  "caseId": "string optional"
}
```

Output:

```json
{
  "ok": true,
  "client": {},
  "case": {},
  "documents": []
}
```

Backend alvo: Mitra Legal Orchestrator / plataforma pública  
Escopo: `mitra:casos:read`

### `mitra.analisar_caso`

Estrutura fatos, pedidos, provas, riscos e próximas perguntas.

Input:

```json
{
  "caseId": "string optional",
  "facts": "string optional",
  "documents": ["string optional"],
  "objective": "string"
}
```

Output:

```json
{
  "ok": true,
  "facts": [],
  "issues": [],
  "risks": [],
  "questions": [],
  "needsHumanReview": true
}
```

Backend alvo: Mitra Legal Orchestrator  
Escopo: `mitra:analise:run`

### `mitra.analisar_documento`

Analisa documento jurídico enviado ou registrado.

Input:

```json
{
  "documentId": "string optional",
  "text": "string optional",
  "objective": "string"
}
```

Output:

```json
{
  "ok": true,
  "summary": "string",
  "points": [],
  "risks": [],
  "needsHumanReview": true
}
```

Backend alvo: Mitra Legal Orchestrator  
Escopo: `mitra:documentos:read`

### `mitra.gerar_tese`

Gera tese assistida com base em fatos, fontes e precedentes.

Input:

```json
{
  "caseId": "string optional",
  "facts": "string",
  "sources": ["string optional"],
  "objective": "string"
}
```

Output:

```json
{
  "ok": true,
  "thesis": "string",
  "sourcesUsed": [],
  "warnings": [],
  "needsHumanReview": true
}
```

Backend alvo: Mitra Legal Orchestrator  
Escopo: `mitra:analise:run`

### `mitra.gerar_minuta`

Gera minuta assistida para revisão humana.

Input:

```json
{
  "caseId": "string optional",
  "pieceType": "string",
  "facts": "string",
  "sources": ["string optional"],
  "instructions": "string optional"
}
```

Output:

```json
{
  "ok": true,
  "draft": "string",
  "sourcesUsed": [],
  "warnings": [],
  "needsHumanReview": true
}
```

Backend alvo: Mitra Legal Orchestrator  
Escopo: `mitra:minutas:generate`

Regra: toda minuta deve ser marcada como rascunho sujeito a revisão humana.

### `mitra.veritas`

Verifica consistência, fontes e riscos de tese ou minuta.

Input:

```json
{
  "text": "string",
  "sources": ["string optional"],
  "objective": "string optional"
}
```

Output:

```json
{
  "ok": true,
  "findings": [],
  "unsupportedClaims": [],
  "sourceIssues": [],
  "needsHumanReview": true
}
```

Backend alvo: Mitra Legal Orchestrator / Veritas  
Escopo: `mitra:veritas:run`

## Erros padrão

Todas as ferramentas devem retornar erro estruturado:

```json
{
  "ok": false,
  "error": "string",
  "reason": "string optional",
  "retryable": false,
  "needsHumanReview": true
}
```

Erros canônicos:

```txt
unauthorized
forbidden
insufficient_scope
tenant_not_found
case_not_found
source_unavailable
provider_timeout
invalid_input
dependency_unavailable
human_review_required
```

## Segurança

- Não executar SQL arbitrário.
- Não escrever em banco de cliente no v1.
- Não praticar ato jurídico autônomo.
- Não inventar fonte.
- Não retornar segredo.
- Não vazar dados entre tenants.
- Não registrar conteúdo sensível em logs quando evitável.
- Não permitir ferramenta destrutiva sem contrato próprio e aprovação.

## Plataforma pública

A plataforma pública da Mitra deve operar como SaaS:

```txt
criar tenant
gerenciar usuários
gerenciar casos
subir documentos
visualizar pesquisas
controlar fontes
conectar ChatGPT/MCP
acompanhar uso
billing
permissões
auditoria
```

O cliente não deve copiar token técnico manualmente em operação normal.

## Modelo de custo

Quando o cliente usa ChatGPT via MCP, a sessão/modelo ChatGPT é do cliente ou workspace dele. A API Developers cobra a plataforma Mitra, ferramentas, dados, armazenamento, conectores, auditoria, automações e consumo SaaS.

Se o backend Mitra chamar OpenAI API por conta própria, esse custo é da API Developers ou do BYOK do cliente, conforme plano.

## Critérios de pronto do MCP v1

1. Servidor MCP v1 criado.
2. `mitra.status` funcionando.
3. `mitra.capabilities` funcionando.
4. Pelo menos uma ferramenta Lex read-only funcionando.
5. Pelo menos uma ferramenta Mitra Orchestrator funcionando.
6. Autenticação por tenant/usuário definida.
7. Escopos aplicados.
8. Logs sanitizados.
9. Skill jurídica Mitra v1 criada.
10. Teste ponta a ponta com Milena ou cliente piloto.

## Próximo passo

Implementar primeiro o esqueleto do Mitra MCP v1 com:

```txt
mitra.status
mitra.capabilities
mitra.buscar_jurisprudencia
mitra.pesquisar_fontes_oficiais
mitra.buscar_processo
```
