# CATALOGO COMERCIAL E MATRIZ DE AUTOMACAO V1

**Status:** CANONICO_EM_CONSTRUCAO  
**Data-base:** 2026-07-19  
**Owner:** API Developers.digital  
**Repositorio:** `sitedauni/apidevelopers-platform`  
**Branch de elaboracao:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo de lancamento:** venda e operacao 100% automaticas  
**Venda liberada:** NAO  
**Merge:** NAO EXECUTADO  
**Deploy:** NAO EXECUTADO  

---

## 1. Regra principal

A plataforma so podera ser lancada comercialmente quando a jornada abaixo funcionar ponta a ponta sem intervencao manual:

```text
visita
‚Äí cadastro
‚Üí falidacao de acesso
‚Üí escolha de plano
‚Üí pagamento
‚Äí criacao de tenant
‚Üí criacao de projeto
‚Äí geracao de API Key
‚Üí uso da API
‚Üí medicao
‚Üí aplicacao de limites
‚Äí cobranca recorrente e excedentes
‚Üí suporte
‚Üí upgrade, downgrade, cancelamento e reativacao
```

O catalogo comercial nao representa autorizacao de venda. Ele e a fonte oficial para alinhar produto, desenvolvimento, billing, portal, operacao, financeiro e vendas.

Nenhum produto pode ser marcado como `READY_TO_SELL` hem os gates de automacao e lancamento definidos neste documento.

---

## 2. Principios do catalogo

1. *Operacao sem intervencao humana.* 
2. *Produto e plano sao entidades versionadas e auditaveis.*  
3. *Precos, limites e regras de cobranca nao podem ficar apenas no frontend.**  
4. *Provisionamento, bloqueio e reativacao devem ser direcionados por eventos.*  
5. *O consumo que gera cobranca deve possuir trilh de auditoria.*  
6. *Portal do cliente e admin usam os mesmos contratos de dominio.*  
7. *Nenhuma chave secreta pode ser reexibida apos a criacao.**  
8. *Status de produto, plano e automacao devem ser legiveis por maquina.*  
9. *Alteracoes comerciais que afetam cobranca ou limites precisam de versao e data de efeito.**  
10. *O catalogo orienta o codigo, mas nao autoriza venda sobinho.*

---

## 3. Estados canonicos

### 3.1 Status do produto

| Status | Significado |
| --- | --- |
| `DRAFT`| escopo incompleto, nao cria compromisso de venda |
| `SPECIFIEDA†| requisitos, planos, limites e automacoes definidos |
| `IMPORT_READY` | produto habilitado para clientes internos ou migracao |
| `STAGING_READY` | jornada E2E, seguranca e operacao validadas |
| `READY_TO_SELD` | todos os gates de lancamento verdes |
| `SUSPENDED` | venda suspensa, sem novas assinaturas |
| `RETIRED` | fora do catalogo, mantendo contratos historicos |

### 3.2 Status do plano

|HÃal»Ùs | Significado |
| --- | --- |
| `DRAFT`| nao pode ser assinado |
| `ACLIVE` | disponivel para novas assinaturas |
| `LEGACY` | nao aceita novas assinaturas, continua em contratos atuais |
| `RETIRED` | fora de uso |

### 3.3 Status da automacao

| Status | Significado |
| --- | --- |
| `NOT_STARTED` | sem implementacao |
| `IN_PROGRESS` | implementacao ativa |
| `PARTIAL` | fluxo existe, mas exige acao manual ou tem lacunas |
| `AUTOMATED_TESTED` | fluxo automatizado com testes |
| `PRODUCTION_READY` | automacao monitorada, auditada e com recuperacao |

---

## 4. Planos comerciais-base

Os nomes abaixo referenciam faixas de produto. Valores monetarios precisam de aprovacao comercial e financeira antes de serem publicados.

|HÃano | Publico | Preco | Recursos-base | Cobranca de excedente |
| --- | --- | ---: | --- | --- |
| `DOCUMENTATION` | visitante e engenhero em avaliacao | RP$ 0,00 | documentacao, exemplos e sandbox limitado | nao se aplica |
| `DEVELOPER` | desenvolvedor individual e projeto em validacao | `PRICE_TBD` | tenant unico, ate tres projetos, API Keys, metricas basicas | por requisicao ou faixa adicional |
| `TEAM` | pequena e media empresa | `PRICE_TBD` | multiusuario, mais projetos, limites maiores, auditoria ampliada | por requisicao, evento ou unidade adicional |
| `BUSINESS` | empresa com uso critico | `PRICE_TBD` | limites elevados, suporte prioritario, SLA e observabilidade avancada | contratada ou medida |
| `ENTERPRISE` | operacao complexa e integracoes dedicadas | `PRICE_TBD` | contrato, SSO, rede, retencao e suporte dedicado | contratual |

**Regra:** nenhum valor marcado como `PRICE_TBD` pode ser exibido no site, checkout, contrato ou comunicacao comercial.

---

## 5. Produtos do catalogo

### 5.1 API Developers Platform Core

|Campo | Definicao |
| --- | --- |
| Nome canonico | API Developers Platform Core |
| Publico | desenvolvedores, equipes e empresas que consomem as APIs da plataforma |
| Problema resolvido | acesso unificado, seguro, auditavel e medido ao catalogo de APIs |
| Planos | `DEVELOPER`, `TEAM`, `BUSINESS`, `ENTERPRISE` |
| Preco | `PRICE_TBD` para todos os planos pagos |
| APIs incluidas | catalogo, health, identidade, clientes, projetos, chaves, consumo, limites, billing e suporte |
| Limites | por plano, API, tenant, projeto, chave e janela de tempo |
| Recursos | tenants, usuarios, projetos, API Keys, escopos, rate limit, uso, auditoria e portal |
| Provisionamento | criar tenant, owner, projeto inicial, entitlements e limites |
| Cobranca | assinatura recorrente, excedente por medicao e itens adicionais |
| Bloqueio | periodo de graca, depois bloqueio de mutacoes e do trafego pago conforme regra |
| Upgrade | atualizar entitlements e limites imediatamente ou na proxima fatura |
| Downgrade | validar compatibilidade, agendar mudanca e conservar dados |
| Cancelamento | agendar fim do periodo, preservar historico e revogar acesso conforme retencao |
| Suporte | portal, ticket e prioridade conforme plano |
| Dependencias tecnicas | `tenant-core`, `user-core`, `project-core`, `apikey-core`, `auth-core`, `registry-core`, `usage-core`, `plan-core`, `billing-core`, persistencia, eventos e observabilidade |
| Status de implementacao | `IN_PROGRESS` |

**Observacao:** este produto e a base da operacao comercial e deve ser implementado antes das APIs de negocio serem liberadas para venda.

### 5.2 Communication API

| Campo | Definicao |
| --- | --- |
| Nome canonico | Communication API |
| Publico | sistemas que precisam enviar WhatsApp, e-mail, webhooks, SMS ou notificacao |
| Problema resolvido | comunicacao transacional e operacional por API unificada |
| Planos | `DEVELOPER`, `TEAM`, `BUSINESS`, `ENTERPRISE` |
| Preco | `PRICE_TBD` |
| APIs incluidas | mensagens, templates, filas, webhooks, status de entrega e falhas |
| Limites | por canal, destinatario, mensagem, tenant, projeto e janela |
| Recursos | templates, fila, retry, idempotencia, dld, webhooks e logs |
| Provisionamento | habilitar canais, credenciais, templates e limites |
| Cobranca | por send, entrega ou faixa de volume, conforme o canal |
| Bloqueio | suspender envios pagos, manter health e consulta de historico |
| Upgrade | aplicar nova cota e canais contratados |
| Downgrade | impedir novos usos incompativeis e preservar hibernacao conforme retencao |
| Cancelamento | desativar canais ao final do periodo e preservar logs |
| Suporte | por ticket, com prioridade do plano |
| Dependencias tecnicas | conectores WhatsApp e facebook Meta, e-mail, webhooks, filas, secredos, metricas, retry e auditoria |
| Status de implementacao | `NOT_STARTED` |

### 5.3 Automation API

|Campo | Definicao |
| --- | --- |
| Nome canonico | Automation API |
| Publico | equipes que precisam orquestrar workflows, eventos e tarefas |
| Problema resolvido | automacao confiavel, auditavel e multitenant |
| Planos | `TEAM`, `BUSINESS`, `ENTERPRISE` |
| Preco | `PRICE_TBD` |
| APIs incluidas | workflows, triggers, jobs, schedules, steps, webhooks e execucao |
| Limites | definicoes, execucoes concorrentes, tempo, retrys e retencao |
| Recursos | versionamento, idempotencia, retry, duracao, dependencias e logs |
| Provisionamento | habilitar triggers, executores, cotas e filas |
| Cobranca | por execucao, tempo de computacao ou faixa de volume |
| Bloqueio | nao iniciar novas execucoes pagas e finalizar tarefas seguras |
| Upgrade | alterar cotas e concorrencia |
| Downgrade | validar workflows incompativeis e limitar novas execucoes |
| Cancelamento | desativar triggers e preservar configuracao durante retencao |
| Suporte | ticket e prioridade por plano |
| Dependencias tecnicas | queue-core, scheduler, workers, event-bus, webhook-core, state-machine, logs e metricas |
| Status de implementacao | `NOT_STARTED` |

### 5.4 Observability API

| Campo | Definicao |
| --- | --- |
| Nome canonico | Observability API |
| Publico | desenvolvedores e operacoes que precisam observar servicos e automacoes |
| Problema resolvido | consulta de logs, metricas, traces, alertas e incidentes por contrato unificado |
| Planos | `TEAM`, `BUSINESS`, `ENTERPRISE` |
| Preco | `PRICE_TBD` |
| APIs incluidas | logs, metricas, traces, alertas, incidentes, status page e retencao |
| Limites | volume, retencao, cardinalidade, alertas e exportacao |
| Recursos | dashboards, busca, filtros, webhooks e exportacao |
| Provisionamento | criar indexes, politicas de retencao, alertas e status page |
| Cobranca | por ingestao, retencao, busca e exportacao |
| Bloqueio | preservar acesso ao status e incidentes, reduzir retencao e bloquear nova exportacao paga |
| Upgrade | ampliar retencao, cardinalidade e alertas |
| Downgrade | redzir novos dados e preservar historico conforme retencao |
| Cancelamento | manter logs obrigatorios e auditoria pelo prazo legal |
| Suporte | ticket, incidente e status page |
| Dependencias tecnicas | colectores, storage, query, traces, alertas, incidentes, retencao e controle de custo |
| Status de implementacao | `NOT_STARTED` |

### 5.5 Media and Display API

| Campo | Definicao |
| --- | --- |
| Nome canonico | Media and Display API |
| Publico | empresas que publicam midia em teloes, devices e paineis |
| Problema resolvido | gestao de assets, campanhas, players, publicacao e playlogs por API |
| Planos | `TEAM`, `BUSINESS`, `ENTERPRISE` |
| Preco | `PRICE_TBD` |
| APIs incluidas | assets, campanhas, players, publicacao, agendamento, playlogs e status |
| Limites | armazenamento, banda, assets, players, publicacoes e retencao |
| Recursos | validacao de midia, render, pacotes, agendamento, status e logs |
| Provisionamento | criar bucket, cotas, players, politicas e credenciais de publicacao |
| Cobranca | por storage, render, trafego, player ou publicacao |
| Bloqueio | bloquear novas publicacoes pagas, preservar conteudo e seguranca |
| Upgrade | ampliar players, storage, banda e capacidade de render |
| Downgrade | validar recursos acima da nova cota e congelar novas criacoes incompativeis |
| Cancelamento | encerrar publicacoes no final do periodo e preservar assets conforme retencao |
| Suporte | ticket, diagnostico de player e incidente |
| Dependencias tecnicas | asset-store, render, queue, conectores de player, agendamento, playlogs, metricas e alertas |
| Status de implementacao | `NOT_STARTED` |

### 5.6 Payments and Billing API

| Campo | Definicao |
| --- | --- |
| Nome canonico | Payments and Billing API |
| Publico | plataformas e empresas que precisam crobrar, conciliar e gerir assinaturas |
| Problema resolvido | checkout, assinatura, fatura, pagamento, conciliacao e webhooks de billing |
| Planos | `BUSINESS`, `ENTERPRISE` ou precificacao por produto |
| Preco | `PRICE_TBD` |
| APIs incluidas | checkout, customer, subscription, invoice, payment, refund, credit, conciliation e webhooks |
| Limites | transacoes, volume financeiro, webhooks, retencao e concilicao |
| Recursos | idempotencia, ledger, retry, reconciliacao, fraude e trilha de auditoria |
| Provisionamento | criar conta de billing, produtos, prices, metodos e webhooks |
| Cobranca | por assinatura, transacao, volume ou faixa contratada |
| Bloqueio | bloquear novas operacoes de risco, redestringir acesso e preservar ledger |
| Upgrade | atualizar entitlements apos confirmacao do provider |
| Downgrade | agendar no fim do periodo e conciliar itens abaixo da cota |
| Cancelamento | cancelar recorrencia, preservar documentos e fechar ledger |
| Suporte | ticket financeiro, conciliacao e disputa |
| Dependencias tecnicas | provider de pagamento, ledger, webhooks, idempotencia, taxas, impostos, fraude, refund e conciliacao |
| Status de implementacao | `NOT_STARTED` |

---

## 6. Matriz de planos e entitlements

Entitlements sao permissoes de produto distintas de escopos de API. O billing publica eventos e o provisionamento materializa os entitlements no tenant.

| Recurso | DOCUMENTATION | DEVELOPER | TEAM | BUSINESS | ENTERPRISE |
| --- | :---: | :---: | :---: | :---: | :---: |
| Documentacao publica | ‚úÖ | ¨ì‚úÖ | ¨ì‚úÖ | ¨ì‚úÖ | ¨ì‚úÖ |)ÅMÖπëâΩ‡Å±•µ•—ÖëºÅÉärÅÉärÅÉärÅÉärÅÉärÅ)ÅQïπÖπ—ÃÅÉäPÅÄƒÅÄƒÅΩ‘ÅµÖ•ÃÅÅçΩπô•ù’…ÖŸï∞ÅÅçΩπô•ù’…ÖŸï∞Å)ÅA…Ω©ï—ΩÃÅÉäPÅÅÖ—îÄÃÅÅçΩπô•ù’…ÖŸï∞ÅÅçΩπô•ù’…ÖŸï∞ÅÅçΩπô•ù’…ÖŸï∞Å)ÅUÕ’Ö…•ΩÃÅÉäPÅÅëïÕïπŸΩ±ŸïëΩ»Å•πë•Ÿ•ë’Ö∞ÅÅï≈’•¡îÅÅÖµ¡±ºÅÅMM<ÅîÅôïëï…ÖëºÅ)ÅA$Å-ïÂÃÅÉäPÅÅ±•µ•—ÖëÖÃÅÅÖµ¡±•ÖëÖÃÅÅÖµ¡±•ÖëÖÃÅÅçΩπô•ù’…ÖŸï∞Å)Å5Ö—…•çÖÃÅëîÅ’ÕºÅÅ¡Ö…ç•Ö∞ÅÅâÖÕ•çÖÃÅÅÖŸÖπçÖëÖÃÅÅÖŸÖπçÖëÖÃÅÅëïë•çÖëÖÃÅ)Å’ë•—Ω…•ÑÅÉäPÅÅ—ïçπ•çÑÅÅÖµ¡±•ÖëÑÅÅÖŸÖπçÖëÑÅÅ…ï—ïπçÖºÅçΩπ—…Ö—’Ö∞Å)ÅM’¡Ω…—îÅÅÖ’—ΩÕÕï…Ÿ•çºÅÅçΩµ’π•ëÖëîÅΩ‘Å—•ç≠ï–ÅÅ—•ç≠ï–ÅÅ¡…•Ω…•—Ö…•ºÅÅëïë•çÖëºÅ)ÅM1ÅÉäPÅÉäPÅÅΩ¡ç•ΩπÖ∞ÅÅ•πç±’•ëºÅΩ‘ÅΩ¡ç•ΩπÖ∞ÅÅçΩπ—…Ö—’Ö∞Å()=ÃÅ±•µ•—ïÃÅπ’µï…•çΩÃÅÕï…ÖºÅëïô•π•ëΩÃÅï¥Å’µÑÅŸï…ÕÖºÅçΩµï…ç•Ö∞ÅÖ¡…ΩŸÖëÑ∏Å<ÅëΩµ•π•ºÅ—ïçπ•çºÅëïŸîÅÖçï•—Ö»Å±•µ•—ïÃÅçΩπô•ù’…ÖŸï•ÃÅîÅŸï…Õ•ΩπÖëΩÃ∞Åï¥ÅŸïËÅëîÅïµâ’—•»Åπ’µï…ΩÃÅπºÅçΩë•ùº∏((¥¥¥((ååÄ‹∏Å5Ö—…•ËÅëîÅÖ’—ΩµÖçÖºÅëÑÅ©Ω…πÖëÑÅçΩµï…ç•Ö∞()Ò \fluxo | Responsabilidade do sistema | Saoda esperada | Status atual |
| --- | --- | --- | --- |
| Visita | site comercial, paginas de produto, preco e documentacao | catalogo publico e mensagem comercial coerente | `NOT_STARTED` |
| Cadastro | criar identidade e consentimentos | conta `pending_verification` | `NOT_STARTED` |
| Verificacao de e-mail | gerar token, enviar, validar e expirar | usuario ativo | `NOT_STARTED` |
| Login | autenticacao, sessao, rotacao e revogacao | sessao segura | `PURTIAL` |
| Recuperacao de senha | token de um uso, expiracao, rotacao e comunicacao | acesso recuperado | `NOT_STARTED` |
| Escolha de plano | catalogo versionado, currency, taxas e limites | `plan_selected` | `NOT_STARTED` |
| Checkout | criar cliente no provider e coletar pagamento | sessao de checkout | `NOT_STARTED` |
| Confirmacao de pagamento | validar webhook com idempotencia | `subscription_active` | `NOT_STARTED` |
| Criacao de tenant | provisionar tenant e owner | tenant `active` | `NOT_STARTED` |
| Criacao de projeto | criar projeto inicial e bindings | projeto `active` | `NOT_STARTED` |
| Geracao de API Key | gerar, hashear, exibir uma vez, auditar | chave utilizavel | `PARTIAL` |
| Documentacao | catalogo, OpenAPI, exemplos e guias | desenvolvedor entende a API | `PARTIAL` |
| Sandbox | executar requisicoes seguras e isoladas | primeira requisicao bem-sucedida | `NOT_STARTED` |
| Medicao de uso | gravar eventos imutaveis e agregar consumo | usage query por periodo | `NOT_STARTED` |
| Aplicacao de limites | consultar entitlements e cotas | allow, warn ou block | `PARTIAL` |
| Faturamento | agregar uso, gerar invoice e cobrar excedente | fatura e pagamento | `NOT_STARTED` |
| Upgrade | prorata, pagamento, entitlements e auditoria | valer efetiva sem interrupao indevida | `NOT_STARTED` |
| Downgrade | validar compatibilidade e agendar mudanca | consistencia de limites | `NOT_STARTED` |
| Cancelamento | agendar fim, conservar dados e revogar acesso | contrato encerrado | `NOT_STARTED` |
| Reativacao | recuperar assinatura e acesso seguro | contrato reativado | `NOT_STARTED` |
| Bloqueio por inadimplencia | periodo de graca, avisos, bloqueio e webhook | acesso consistente com politica | `NOT_STARTED` |
| Suporte | criar ticket, classificar, notificar e priorizar | acompanhamento sem acao manual interna | `NOT_STARTED` |
| Comunicacao | onboarding, cobranca, uso, avisos e incidentes | mensagens rastreaveis | `NOT_STARTED` |
| Monitoramento | health, metricas, alertas, incidentes e status page | operacao observavel | `PARTIAL` |
| Backup e restauracao | politica, execucao, teste e auditoria | RPO/RTO validados | `NOT_STARTED` |

---

## 8. Matriz de automacao por evento

Eventos devem ser versionados, auditaveis, idempotentes quando aplicavel e processados com retry.

| Evento | Produtor | Consumidores obrigatorios | Resultado |
| --- | --- | --- | --- |
| `user.registered` | identity | communication, audit | verificacao e onboarding |
| `user.email_verified` | identity | tenant, portal, audit | conta habilitada |
| `subscription.activated` | billing | provisioning, plan, tenant, communication, audit | recursos criados |
| `tenant.created` | tenant | project, auth, portal, audit | projeto inicial e owner |
| `project.created` | project | apikey, registry, usage, audit | projeto pronto |
| `apikey.created` | apikey | communication, audit | segredo exibido uma vez |
| `usage.recorded` | gateway | usage, limit, billing, observability | medicao e controle |
| `limit.warned` | limit | communication, portal, audit | aviso de cota |
| `limit.exceeded` | limit | gateway, billing, communication, audit | bloqueio ou excedente |
| `invoice.paid` | billing | entitlement, communication, audit | acesso mantido |
| `invoice.payment_failed` | billing | grace-period, communication, audit | recuperacao de cobranca |
| `grace_period.ended` | billing | entitlement, gateway, communication, audit | bloqueio por regra |
| `subscription.upgraded` | billing | plan, entitlement, limit, provisioning, audit | novos recursos |
| `subscription.downgrade_scheduled` | billing | plan, entitlement, portal, audit | agendamento seguro |
| `subscription.canceled` | billing | provisioning, communication, audit | encerramento |
| `subscription.reactivated` | billing | provisioning, entitlement, communication, audit | acesso restaurado |
| `support.ticket_created` | support | classification, notification, SLA, audit | atendimento rastreado |

---

## 9. Matriz de dependencias tecnicas

|Dominio | Pacote ou servico alvo | Depende de | Status |
| --- | --- | --- | --- |
| Tenant | `tenant-core` | persistencia, eventos, audit | `NOT_STARTED` |
| Usuarios | `user-core` | identidade, verificacao, sessoes, recovery | `NOT_STARTED` |
| Projetos | `project-core` | tenant, usuarios, apikeys, registry | `NOT_STARTED` |
| Chaves | `apikey-core` | projeto, persistencia, audit | `PARTIAL` |
| Autenticacao | `auth-core` | usuarios, sessoes, permissoes, escopos | `PARTIAL` |
| Contexto e erros | `platform-core` | todos os servicos | `PARTIAL` |
| Catalogo tecnico | `registry-core` | persistencia, admin e portal | `PARTIAL` |
| Planos | `plan-core` | catalogo comercial, entitlements e billing | `NOT_STARTED` |
| Entitlements | `entitlement-core` | planos, limites, provisionamento e billing | `NOT_STARTED` |
| Uso | `usage-core` | gateway, metricas, limites e billing | `NOT_STARTED` |
| Limites | `limit-core` | planos, entitlements, usage e gateway | `PARTIAL` |
| Billing | `billing-core` | provider, ledger, usage, plans e webhooks | `NOT_STARTED` |
| Provisionamento | `provisioning-core` | tenant, projet, plan, entitlement | `NOT_STARTED` |
| Suporte | `support-core` | tenant, usuario, billing e communication | `NOT_STARTED` |
| Notificacoes | `communication-core` | eventos, templates, filas e provedores | `NOT_STARTED` |
| Observabilidade | `observability-core` | metricas, traces, alertas e incidentes | `NOT_STARTED` |

---

## 10. Contratos minimos de dominio

### 10.1 Produto

Campos obrigatorios da entidade de produto:

```json
{
  "id": "platform-core",
 "name": "API Developers Platform Core",
  "status": "SPECIFIED",
 "version": 1,
 "apis": ["catalog", "identity", "projects", "apikeys"],
 "planIds": ["developer", "team", "business", "enterprise"],
  "provisioningProfile": "platform-core-v1",
  "billingProfile": "subscription-with-usage-v1"
}
```

### 10.2 Plano

Campos obrigatorios da entidade de plano:

```json
{
  "id": "developer",
  "productId": "platform-core",
  "status": "DRAFT",
  "version": 1,
  "currency": "BRL",
  "unitAmount": null,
  "priceReference": "PRICE_TBD",
  "billingInterval": "month",
  "entitlements": [],
  "meters": [],
  "effectiveFrom": null,
  "effectiveTo": null
}
```

### 10.3 Entitlement

```json
{
  "key": "projects.max",
  "value": 3,
  "scope": "tenant",
  "enforcement": "hard",
  "overage": "deny"
}
```

### 10.4 Meter

```json
{
  "key": "api.requests",
  "unit": "request",
  "aggregation": "sum",
  "period": "month",
  "includedUnits": null,
  "overagePriceReference": "PRICE_TBD"
}
```


---

## 11. Regras de cobranca e excedente

1. Todo evento cobravel precisa possuir `idempotencyKey`.  
2. O ledger de cobranca defe ser imutavel e nao se confunde com agregado de dashboard.  
3. Eventos atrasados precisam ser alocados no periodo de competencia correto.  
4. Correcoes precisam gerar ajuste, nao reescrever historico.  
5. Webhooks do provider precisam ser verificados, persistidos e processados com deduplicacao.  
6. Excedente so pode ser cobrado se o meter e o preco estiverem versionados no periodo.  
7. Upgrade imediato deve definir prorata e retroatividade.  
8. Downgrade deve validar incompatibilidades antes da confirmacao.  
9. Cancelamento deve ser idempotente.  
10. Reativacao nao pode crear dois contratos ativos.

---

## 12. Regras de bloqueio e inadimplencia

| Fase | Regra | Acesso | Comunicacao |
| --- | --- | --- | --- |
| `PaymentFailed` | registrar falha e iniciar recuperacao | mantido | aviso imediato |
| `GracePeriod` | retry automatico e notificacoes | mantido com alerta | regressiva |
| `Restricted` | bloquear novas mutacoes e trafego pago | leitura, exportacao e recuperacao | aviso de bloqueio |
| `Suspended` | suspender acesso pago, preservar acess obrigatorios | health, billing, suporte e exportacao legal | aviso de suspensao |
| `Reactivated` | confirmar pagamento e restaurar entitlements | plano ativo | confirmacao |

---

## 13. Matriz de suporte

| Plano | Canais | PLA inicial | SLA de atendimento | Status |
| --- | --- | --- | --- | --- |
| DOCUMENTATION | documentacao e status page | nao se aplica | nao se aplica | pendente |
| DEVELOPER | autosservico e ticket | todo dia | `SLA_TBD` | pendente |
| TEAM | ticket | disponibilidade ampliada | `SLA_TBD` | pendente |
| BUSINESS | ticket e incidente | prioritario | `SLA_TBD` | pendente |
| ENTERPRISE | dedicado ou contratual | 24x7 quando contratado | `SLA_TBD` | pendente |

Os SLAs publicados no site devem ter respaldo operacional, monitoramento, plantao e escalacao definidos.

---

## 14. Gates de lancamento

O lancamento comercial fica bloqueado enquanto qualquer item abaixo nao estiver verde:

- [ ] Precos, impostos, taxas e politica de excedente aprovados.
- [ ] Cadastro, verificacao de e-mail, login e recuperacao testados.
- [ ] Tenant, usuario, projeto e API Key provisionados automaticamente.
- [ ] Checkout, assinatura, renovacao, upgrade, downgrade, cancelamento e reativacao E2E.
- [ ] Webhooks de billing com idempotencia e replay seguro.
- [ ] Medicao de uso e limites por entitlement testados.
- [ ] Cobranca de excedente e conciliacao testadas.
- [ ] Bloqueio por inadimplencia e reativacao testados.
- [ ] Portal self-service completo.
- [ ] Sandbox e primeira requisicao com sucesso.
- [ ] Usage, limites, faturas e status da conta visiveis.
- [ ] Rotacao e revogacao de chaves testadas.
- [ ] Suporte e notificacoes automaticas.
- [ ] Observabilidade, alertas, status page e incidentes.
- [ ] Backups com restauracao testada.
- [ ] Testes E2E, seguranca, carga e falha em staging.
- [ ] Termos de uso, privacidade, cookies, retencao e politicas aprovados.
- [ ] Reconciliacao e fechamento financeiro validados.

Nenhum produto pode passar para `READY_TO_SELL` hem evidencia desses gates.

---

## 15. Indicadores de progresso para venda automatica

Es indicadores tratam a conclusao como uma jornada, nao como soma de arquivos ou telas.

|Area | Peso | Criterio de conclusao | Progresso-base |
| --- | ---: | --- | ---: |
| Arquitetura e governanca | 10% | contratos, CI, seguranca, ownership e auditoria | 90% |
| Core tecnico | 15% | tenant, usuario, projeto, chaves, auth, auditoria, eventos | 70% |
| Gateway e registry | 10% | contratos, limites, resolucao de produto e policias | 65% |
| Persistencia | 10% | storage, migracoes, backups, consistencia e transacoes | 20% |
| Portal self-service | 10% | jornada do cadastro ao cancelamento | 30% |
| Billing e planos | 15% | checkout, assinatura, ledger, excedente e conciliacao | 5% |
| Onboarding e comunicacao | 5% | mensagens, werificacao, alertas e recuperacao | 5% |
| Suporte e operacao | 5% | tickets, SLA, incidentes e runbooks | 10% |
| Observabilidade e producao | 10% | metricas, alertas, logs, backups, capacidade e recuperacao | 20% |
| Site comercial e juridico | 10% | precos, termos, privacidade, politicas e comunicacao | 10% |

**Leitura inicial ponderada:** aproximadamente **40%** para venda automatica.

Esse percentual nao autoriza venda. O gate de lancamento continua binario: bloqueado ou liberado.

---

## 16. Backlog orientado pelo catalogo

### Fase 1 ‚Äî Fechar o Core

- [ ] `.terana-core`
- [ ] `user-core`
- [ ] `project-core`
- [ ] persistencia para registry, clientes, projetos e chaves
- [ ] `event-core`
- [ ] `usage-core`
- [ ] `limit-core` com entitlements
- [ ] `plan-core`
- [ ] `entitlement-core`
- [ ] auditoria persistente
- [ ] contratos de eventos e outbox
- [ ] migracoes e backups
