# Uni Social — política de conversão cambial v1

Status: regra comercial aprovada; preços e cobrança live permanecem desativados.

## Regra comercial

A Uni Social terá **um único preço econômico-base em BRL**.

Para mercados cuja moeda de cobrança não seja BRL, o valor será obtido por **conversão cambial direta** do preço-base. Não existe desconto, acréscimo, markup ou preço regional por país.

Em termos operacionais:

`preço local = preço-base em BRL × cotação BRL→moeda local`

O idioma da interface não participa dessa decisão. A moeda continua sendo determinada pelo mercado/país de cobrança validado server-side.

## Auditoria da cotação

Toda conversão precisa carregar:

- moeda-base (`BRL`);
- moeda de destino;
- taxa usada;
- instante/data de referência (`asOf`);
- fonte da cotação (`source`).

A fonte de câmbio ainda não foi escolhida. Nenhuma taxa corrente é gravada no repositório.

## Arredondamento

A conversão arredonda somente para a menor unidade efetivamente cobrável da moeda:

- BRL, USD, EUR, CNY: 2 casas;
- JPY, KRW: unidade inteira.

O arredondamento é determinístico, half-up, depois da conversão direta. Não é aplicado arredondamento comercial para terminar em `.99`, centenas, milhares ou qualquer outro preço psicológico.

## Guardrails

- `marketUpliftBps = 0`;
- nenhuma moeda deriva do locale;
- nenhuma taxa cambial fixa é codificada como regra comercial;
- nenhum provider recebe `amountMinor` até o mercado estar habilitado;
- a taxa usada no checkout deve ser a mesma usada para apresentar o preço ao cliente durante a validade daquela cotação;
- preços da Uni Social continuam `active:false` até aprovação do preço-base e da fonte de câmbio;
- este documento não ativa checkout, cobrança, provider live, merge ou deploy.

## Próximas decisões

1. definir o preço-base oficial em BRL por plano;
2. escolher a fonte oficial de câmbio e política de atualização/validade;
3. gerar os valores locais server-side a partir desse preço-base;
4. só depois habilitar providers/mercados individualmente.
