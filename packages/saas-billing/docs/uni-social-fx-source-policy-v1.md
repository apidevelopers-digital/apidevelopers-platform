# Uni Social — fonte de câmbio e validade v1

Status: política técnica preparada; provider global e cobrança live continuam pendentes.

## Decisão

A moeda-base comercial da Uni Social continua sendo BRL. Para mercados globais, a cobrança deve preservar o mesmo preço econômico usando conversão cambial direta, sem markup regional.

Para uma futura operação global com Stripe, a fonte transacional candidata é **Stripe FX Quotes**.

Política:

- `to_currency`: BRL, como moeda econômica/base de liquidação;
- `from_currencies`: moeda local de apresentação/cobrança;
- `lock_duration`: `hour`;
- `usage.type`: `payment`;
- preço mostrado ao cliente: calculado pelo `base_rate`, sem repassar a tarifa cambial como aumento comercial;
- tratamento da tarifa FX: absorvida pela operação;
- `marketUpliftBps = 0`;
- quote expirada ou indisponível: fail-closed;
- não reutilizar quote vencida silenciosamente.

## Validade

A cotação transacional é válida somente até o `lock_expires_at` retornado pelo provider. A política inicial usa lock de **1 hora**.

Não existe TTL paralelo inventado pelo Billing Core: o timestamp do provider é a autoridade para validade da quote.

## Fontes de referência

BCB PTAX e ECB reference rates podem ser usados para conferência, observabilidade e diagnóstico, mas não são a autoridade do checkout global.

A API PTAX do BCB consultada cobre BRL com USD, EUR e JPY entre suas moedas publicadas, mas não cobre CNY ou KRW no conjunto `Moedas` atual. O ECB cobre as moedas alvo, porém publica taxas de referência para fins informativos e desaconselha seu uso transacional.

## Guardrails

- idioma nunca escolhe moeda;
- país/mercado de cobrança continua sendo a autoridade de moeda;
- BRL não exige FX;
- USD, EUR, JPY, KRW e CNY exigem quote transacional válida quando o provider global estiver habilitado;
- nenhuma cotação é persistida como preço comercial fixo;
- nenhuma credencial, merchant account ou checkout live é criado por esta política;
- Stripe permanece `provider_pending` até aprovação e configuração separadas.

## Próximo gate

Definir o preço-base oficial em BRL por plano. Só depois conectar o provider global em test mode e exercitar quotes reais.
