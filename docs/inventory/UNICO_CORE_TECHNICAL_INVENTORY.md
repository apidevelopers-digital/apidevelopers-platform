# Inventário técnico — núcleo do `uni.co`

Status: ativo  
Data: 2026-07-15  
Origem: `sitedauni/unico-api-platform`  
Ação nesta etapa: somente leitura e classificação

## Achados

O repositório atual mistura quatro naturezas:

1. runtime do assistente `uni.co`;
2. serviços globais da API Developers.digital;
3. produtos e verticais da `uni.`;
4. compatibilidade e legado operacional.

## Núcleo provável do `uni.co`

- `src/services/unico.service.js`
- `src/routes/unico.routes.js`
- `src/operator/`
- rotas de automação e atendimento relacionadas ao assistente
- integrações com conhecimento, transcrição e provedores de IA

Destino recomendado:

`apps/unico-assistant/`

## Serviços globais a extrair

- autenticação e tenancy
- auditoria
- conhecimento
- transcrição
- Meta / WhatsApp
- persistência
- eventos e observabilidade

Destinos recomendados:

- `packages/auth/`
- `packages/tenancy/`
- `services/audit/`
- `services/knowledge/`
- `services/transcription/`
- `services/channels-meta/`
- `packages/persistence/`

## Duplicações confirmadas

- múltiplas famílias jurídicas:
  - `juri.service.js`
  - `juri.v12.readiness.service.js`
  - `legal-research.service.js`
  - `juri.routes.js`
  - `juri.v12.routes.js`
  - `juris.routes.js`
- duas camadas de compatibilidade do `uni. Operador`:
  - `uni-operador-compat.cjs`
  - `uni-operador-compat.mjs`
- sobreposição entre:
  - `whatsapp.routes.js`
  - `meta.routes.js`
  - `social.routes.js`

## Classificação inicial

| Área | Classificação | Destino |
|---|---|---|
| `uni.co` runtime | MIGRATE_ASSISTANT | `apps/unico-assistant/` |
| auth e tenancy | MIGRATE_PLATFORM | `packages/auth/`, `packages/tenancy/` |
| audit | MIGRATE_PLATFORM | `services/audit/` |
| knowledge | MIGRATE_PLATFORM | `services/knowledge/` |
| transcription | MIGRATE_PLATFORM | `services/transcription/` |
| Meta / WhatsApp | SPLIT | serviços globais + compatibilidade `uni.` |
| jurídico | SPLIT | APIs legais + produto `uni.juri` |
| saúde | SPLIT | APIs de saúde + produto `imuni.` |
| compatibilidade antiga | REVIEW | preservar até substituição validada |
| rotas v1 e legado | KEEP_LEGACY | manter até cobertura por serviços novos |

## Próxima inspeção

1. ler `unico.service.js` e `unico.routes.js`;
2. mapear dependências do assistente;
3. ler canais Meta/WhatsApp;
4. mapear memória e eventos;
5. definir fonte de verdade por domínio.

## Regra de segurança

Nenhum componente de produção será removido antes de inventário de dependências, backup, alternativa compatível, smoke test e rollback documentado.
