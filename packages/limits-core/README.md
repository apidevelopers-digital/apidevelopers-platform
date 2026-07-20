# @apidevelopers/limits-core

Domínio canônico de regras de franquia, janelas e decisões de limite da API Developers.digital.

## Responsabilidades

- representar regras executáveis por plano;
- permitir limites globais, por API e por operação;
- resolver a regra efetiva mais específica;
- calcular janelas UTC por hora, dia e mês;
- calcular consumo, restante, projeção e excedente;
- aplicar modos `hard`, `soft` e `monitor`;
- atribuir planos a tenant ou projeto;
- consultar consumo por uma interface injetável;
- produzir decisão explícita `allow`, `block`, `allow_overage` ou `allow_monitor`.

## Fronteiras

- `usage-core` registra e agrega o consumo usado na avaliação;
- `limits-core` decide se uma nova unidade pode ser consumida;
- `plan-core` será dono do catálogo e da composição comercial dos planos;
- `billing-core` calculará preço, excedentes, faturas e cobrança;
- o Gateway aplicará a decisão retornada pelo domínio.

`limits-core` não armazena segredo, não processa pagamento e não precifica excedentes.

## Modos

| Modo | Ao exceder |
|---|---|
| `hard` | bloqueia |
| `soft` | permite e marca excedente |
| `monitor` | permite e apenas sinaliza |

## Validação

```bash
npm --prefix packages/limits-core run check
```
