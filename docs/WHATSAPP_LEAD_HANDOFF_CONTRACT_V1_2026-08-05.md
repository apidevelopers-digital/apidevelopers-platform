# Contrato de Lead e Handoff WhatsApp v1

**Data:** 2026-08-05  
**Status:** especificação proposta; não implementada  
**Escopo:** roteamento governado entre WhatsApp 5001, WhatsApp 6610, sites, Radar e serviços institucionais.

## 1. Objetivo

Definir um contrato neutro e auditável para transferir um lead ou oportunidade entre canais e organizações sem mensagens diretas improvisadas entre robôs, sem repetição desnecessária de perguntas e sem mistura de identidade institucional.

## 2. Participantes

- `whatsapp-5001`: canal comercial e operacional da uni.;
- `whatsapp-6610`: canal institucional da API Developers.digital;
- `site-uni`: origem de leads da uni.;
- `site-apidevelopers`: origem de leads institucionais;
- `radar`: registro de leads, oportunidades e estágio;
- `gateway`: validação, autorização, idempotência, roteamento e auditoria.

## 3. Envelope canônico

```json
{
  "schema": "apidevelopers.lead-handoff.v1",
  "event": "handoff.requested",
  "event_id": "evt_example_001",
  "correlation_id": "corr_example_001",
  "occurred_at": "2026-08-05T15:00:00Z",
  "source": {
    "organization": "uni",
    "channel": "whatsapp-5001"
  },
  "destination": {
    "organization": "apidevelopers-digital",
    "channel": "whatsapp-6610"
  },
  "lead": {
    "lead_id": "lead_example_001",
    "consent": {
      "granted": true,
      "scope": ["commercial_handoff"],
      "recorded_at": "2026-08-05T14:59:00Z"
    }
  },
  "context": {
    "conversation_summary": "Cliente busca automatizar atendimento e integrar o site ao WhatsApp.",
    "identified_need": "automacao_comercial",
    "suggested_solution": ["whatsapp_automation", "site_integration", "lead_radar"],
    "commercial_stage": "qualified",
    "current_owner": "whatsapp-5001",
    "next_action": "diagnostico_institucional"
  },
  "security": {
    "classification": "internal",
    "pii_minimized": true
  }
}
```

O exemplo é sintético e não contém dados reais.

## 4. Eventos

| Evento | Produtor típico | Resultado esperado |
|---|---|---|
| `lead.captured` | site ou canal | cria identidade de lead |
| `lead.enriched` | Radar/agente | adiciona contexto permitido |
| `lead.qualified` | canal vendedor | registra diagnóstico inicial |
| `opportunity.created` | Radar | abre oportunidade |
| `opportunity.routed` | Gateway | define destino |
| `handoff.requested` | canal de origem | solicita transferência |
| `handoff.accepted` | canal de destino | assume responsabilidade |
| `conversation.continued` | canal de destino | registra continuidade |
| `proposal.generated` | serviço comercial | vincula proposta |
| `sale.closed` | serviço comercial | registra fechamento |
| `delivery.started` | operação | inicia implantação |

## 5. Máquina de estados do handoff

`requested → validated → accepted → continued`

Estados de exceção:

- `rejected`: destino inválido, política ou consentimento insuficiente;
- `expired`: handoff não aceito no prazo;
- `failed`: falha técnica recuperável;
- `dead_lettered`: excedeu tentativas e exige intervenção.

## 6. Regras obrigatórias

1. `event_id` é único;
2. `correlation_id` acompanha toda a jornada;
3. reprocessamento do mesmo evento não cria novo lead ou envio;
4. origem e destino devem pertencer ao catálogo permitido;
5. consentimento deve cobrir a transferência;
6. a conversa integral não é requisito do handoff;
7. o resumo deve ser sanitizado e suficiente;
8. tokens, chaves, segredos e credenciais são proibidos;
9. a aceitação muda o `current_owner`;
10. cada transição gera evidência auditável.

## 7. Política de roteamento inicial

| Necessidade detectada | Destino preferencial |
|---|---|
| mídia, campanha, telão, conteúdo ou produto da uni. | 5001 |
| site, aplicativo, integração, API, automação empresarial ou industrial | 6610 |
| demanda híbrida | 6610 como arquiteto; 5001 como fornecedor da frente uni. quando aplicável |
| suporte de entrega existente | proprietário registrado no Radar |

## 8. Falhas, retentativas e duplicidade

- retentativas devem usar backoff;
- o consumidor deve persistir o resultado antes de confirmar processamento;
- falha de envio não reabre oportunidade;
- eventos duplicados retornam o resultado anterior;
- após o limite de tentativas, o evento vai para fila de intervenção;
- nenhum fallback pode enviar mensagem por outro número sem política explícita.

## 9. Observabilidade mínima

- contagem de leads por origem;
- taxa de qualificação;
- taxa de handoff solicitado, aceito, rejeitado e expirado;
- tempo entre captura e aceite;
- falhas por estágio;
- duplicidades bloqueadas;
- propostas e vendas por origem e destino;
- trilha por `correlation_id`.

## 10. Critérios para implementação

A implementação só pode ser considerada pronta quando houver:

- validação de schema;
- persistência idempotente;
- política de consentimento;
- testes de roteamento;
- testes de duplicidade;
- auditoria;
- métricas;
- fila de falhas;
- integração em shadow com os dois canais;
- teste ponta a ponta sem envio real;
- aprovação explícita para ativação.
