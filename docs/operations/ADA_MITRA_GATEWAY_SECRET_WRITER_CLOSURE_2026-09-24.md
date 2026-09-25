# ADA Mitra Bridge / Gateway Key Provisioner / Secret Writer — Fechamento técnico

Data operacional: 2026-09-24
Repositório: `apidevelopers-digital/apidevelopers-platform`
Frente: ADA Mitra Bridge + Gateway Key Provisioner + Secret Writer institucional para MCP/Skills

## Status

Status operacional: **concluído**
Percentual da frente no fechamento: **97% ±3%**

A frente ficou operacionalmente pronta para:
1. emitir uma API key real dedicada para ADA Mitra Bridge;
2. salvar a key automaticamente como GitHub Organization Secret;
3. liberar o secret para o repositório `apidevelopers-platform`;
4. validar o uso da key contra a rota ADA Mitra Bridge;
5. evitar exposição de segredo em chat, logs e artefatos.

Os 3% restantes são governança futura: documentação ampliada, rotação programada e substituição do PAT transitório por uma GitHub App institucional.

## Objetivo concluído

O objetivo da frente era criar um fluxo institucional e reaproveitável para MCP/Skills/agentes:

```txt
Gateway Key Provisioner
→ emissão real controlada
→ Organization Secret
→ acesso selecionado ao repositório
→ validação ADA Mitra Bridge
→ sem expor segredo no chat
```

## Evidências principais

### Secret writer institucional

O diagnóstico de secret writer foi validado no workflow:

```txt
Gateway Key Provisioner Secret Writer Diagnostic
```

Resultado operacional confirmado:

```txt
GH_SECRET_WRITER_TOKEN
→ autentica no GitHub
→ acessa apidevelopers-platform
→ lê public key de organization secrets
→ grava Organization Secret liberado para apidevelopers-platform
```

PRs relevantes:

- `#607` — ajustou o diagnóstico para Organization Secret.
- `#610` — expôs erro sanitizado da escrita.
- `#613` — corrigiu compatibilidade do `gh secret set` usando `--body`.
- Diagnóstico `#13` — validou escrita institucional com sucesso.

### Workflow real de emissão e armazenamento

Workflow:

```txt
Gateway Key Provisioner Real Issue and Store
```

Ajuste relevante:

- `#615` — alterou o workflow real para salvar `ADA_MITRA_BRIDGE_READ_TOKEN` como Organization Secret com acesso ao repositório `apidevelopers-platform`.

Resultado confirmado:

```txt
Run #3
→ key real emitida
→ ADA_MITRA_BRIDGE_READ_TOKEN salvo como Organization Secret
→ validação ADA Mitra Bridge passou
→ segredo não foi exposto
```

### Runtime Hostinger

Durante a validação, a auditoria identificou que o runtime ativo da Hostinger era o runtime mínimo:

```txt
hostinger-minimal-secret-handoff-account-runtime-v2
```

Esse runtime preservava Secret Handoff, MySQL staging e Conta uni preview, mas inicialmente não expunha a rota ADA Mitra Bridge e depois não expunha o provisionador.

Correções aplicadas na branch `deploy/hostinger-gateway-runtime`:

- `#619` — adicionou ADA Mitra Bridge read-only ao runtime mínimo.
- `#620` — reexpôs o Gateway Key Provisioner no runtime mínimo.

Rotas relevantes no runtime:

```txt
GET  /v1/ada/mitra/status
GET  /v1/ada/mitra/capabilities
GET  /v1/ada/mitra/connectors
POST /v1/operator/api-keys/issue
```

## Secrets institucionais envolvidos

Secrets usados/gerados:

```txt
GH_SECRET_WRITER_TOKEN
ADA_MITRA_BRIDGE_TENANT_ID
ADA_MITRA_BRIDGE_READ_TOKEN
API_GATEWAY_OPERATOR_KEY
```

Modelo adotado:

```txt
Organization Secret
→ Selected repositories
→ apidevelopers-platform
```

Observação: `GH_SECRET_WRITER_TOKEN` é transitório. O modelo definitivo deve migrar para GitHub App institucional.

## Segurança aplicada

A frente respeitou estes limites:

- nenhum segredo foi colado no chat;
- nenhum segredo foi impresso em logs;
- a key real foi mascarada antes de qualquer etapa posterior;
- a key real foi salva diretamente como Organization Secret;
- emissão real exigiu aprovação explícita;
- dry-runs foram executados antes da emissão real;
- a escrita de secrets foi validada separadamente antes de nova emissão;
- DNS, banco e deploy manual não foram alterados por esta frente.

## Fluxo de rotação futura

Para rotacionar `ADA_MITRA_BRIDGE_READ_TOKEN`:

1. confirmar que o runtime Hostinger expõe `POST /v1/operator/api-keys/issue`;
2. rodar o dry-run do provisionador;
3. confirmar que o secret writer institucional está válido;
4. executar o workflow `Gateway Key Provisioner Real Issue and Store` com aprovação explícita;
5. verificar `ADA Mitra Bridge Saved Token Verify`.

Aprovações operacionais usadas nesta frente:

```txt
IGOR_APROVA_GATEWAY_KEY_PROVISIONER_SECRET_WRITER_DIAGNOSTIC
IGOR_APROVA_GATEWAY_KEY_PROVISIONER_REAL
IGOR_APROVA_ADA_MITRA_SAVED_TOKEN_VERIFY
```

## Pendência futura

A pendência estratégica não bloqueante é substituir o PAT transitório por uma GitHub App institucional.

Meta futura:

```txt
API Developers GitHub App
→ emitir installation token
→ gerenciar Organization Secrets
→ registrar auditoria
→ servir MCP/Skills/agentes
```

Essa migração deve ser tratada como frente própria de governança.

## Estado final

Estado final desta frente:

```txt
ADA Mitra Bridge operacional
Gateway Key Provisioner operacional
Secret writer institucional operacional
ADA_MITRA_BRIDGE_READ_TOKEN salvo e validado
```

Classificação:

```txt
Concluído operacionalmente
Documentado
Pronto para continuidade MCP/Skills
```
