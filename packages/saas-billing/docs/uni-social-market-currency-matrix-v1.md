# Uni Social — matriz de mercados e moedas v1

Status: arquitetura comercial preparada; preços e cobrança live continuam desativados.

## Regra de autoridade

A moeda de cobrança é resolvida pelo **país de cobrança validado**, nunca pelo idioma da interface.

Exemplos:
- interface em japonês + cobrança no Brasil → BRL;
- interface em português + cobrança nos Estados Unidos → USD;
- cobrança no Japão → JPY;
- cobrança na China → CNY.

O navegador não tem autoridade para enviar `amountMinor`, `currency` ou `provider`. O catálogo server-side continua sendo a fonte de preço e moeda efetivamente cobrados.

## Matriz inicial

| Mercado | Países iniciais | Moeda | Provider operacional | Candidato técnico | Estado |
| --- | --- | --- | --- | --- | --- |
| Brasil | BR | BRL | Mercado Pago | — | teste configurado |
| Estados Unidos | US | USD | — | Stripe | provider pendente |
| Zona do euro | AT, BE, DE, ES, FI, FR, GR, IE, IT, LU, NL, PT | EUR | — | Stripe | provider pendente |
| Japão | JP | JPY | — | Stripe | provider pendente |
| Coreia do Sul | KR | KRW | — | Stripe | provider pendente |
| China | CN | CNY | — | Stripe | provider pendente |

`Stripe` aparece apenas como candidato porque já existe adapter de teste no Billing Core. Isso **não** significa provider oficial configurado, merchant account criado, preço aprovado ou checkout live.

## Guardrails

- locale não seleciona moeda;
- país não informado ou mercado não configurado falha fechado;
- somente mercado com provider explicitamente configurado pode chegar ao checkout;
- preços por mercado serão aprovados separadamente;
- nenhuma conversão cambial automática cria preço comercial;
- nenhum preço da Uni Social é ativado por este documento;
- nenhuma cobrança live é habilitada.

## Próxima decisão comercial

Definir os preços oficiais da Uni Social por plano e por mercado, mantendo valores arredondados e deliberados em cada moeda. Depois disso, criar os catálogos server-side correspondentes ainda com `active:false` até a aprovação de ativação.
