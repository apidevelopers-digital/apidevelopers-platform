# Inventário — Canais e Memory

Status: ativo  
Data: 2026-07-15  
Origem: `sitedauni/unico-api-platform`  
Ação: leitura e classificação, sem migração.

## WhatsApp

Arquivos analisados:
- `src/routes/whatsapp.routes.js`
- `src/routes/meta.routes.js`
- `src/services/meta.service.js`

Achados:
- Existe sobreposição entre rotas WhatsApp e Meta.
- O endpoint dedicado de envio ainda contém comportamento placeholder.
- A camada Meta já realiza chamadas reais à Graph API.
- A configuração atual é mono-conta e baseada em variáveis globais de ambiente.
- O WATI 5001 permanece compatibilidade operacional da `uni.` até substituição validada.

Destino:
- `services/channels-whatsapp/`

Requisitos:
- multi-tenant;
- múltiplas WABAs, números e Meta Apps;
- credenciais por conexão segura;
- webhooks normalizados;
- texto, mídia, documento, áudio, template e interativo;
- idempotência, auditoria, rate limits e handoff humano.

## Instagram

Arquivos analisados:
- `src/routes/meta.routes.js`
- `src/services/meta.service.js`

Achados:
- Já existem leitura de perfil, listagem de mídia e publicação.
- A configuração atual usa uma conta e um token globais.
- Ainda faltam catálogo de conexões, lifecycle de tokens e isolamento por tenant.
- Mensagens, comentários, insights e webhooks ainda não formam um serviço completo.

Destino:
- `services/channels-instagram/`

Requisitos:
- múltiplas contas Business/Creator;
- OAuth e lifecycle de tokens;
- publicações, mídia, comentários, mensagens, insights e webhooks;
- permissões, auditoria, idempotência e handoff humano.

## Memory

Arquivo analisado:
- `unico-memory-actions-bridge.js`

Achados:
- Armazenamento atual em `Map`, limitado ao processo.
- Seeds operacionais embutidos no código.
- Rotas registradas por monkey patch do Express.
- Existem proposta, aprovação, arquivamento e ações candidatas.
- Ações reais permanecem desabilitadas.
- Faltam persistência durável, isolamento tenant explícito, retenção, revogação e consentimento.

Destinos:
- `services/memory/`
- `services/action-registry/`
- `apps/unico-assistant/` para regras específicas do `uni.co`.

## Decisões

1. WhatsApp API e Instagram API serão serviços globais independentes.
2. Credenciais não serão globais; pertencerão a conexões isoladas por tenant.
3. Memory armazenará informação autorizada e auditável; não executará ações.
4. O `uni.co` consumirá Memory, Conversation, Workflow e Channel APIs.
5. Nenhum componente atual será removido antes de compatibilidade, testes, backup e rollback.
