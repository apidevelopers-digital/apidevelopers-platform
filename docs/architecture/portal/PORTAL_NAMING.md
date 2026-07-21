# Nomenclatura das Superfícies

**Status:** referência modular de linguagem  
**Escopo:** nomes de produto, superfície e frente técnica  
**Não altera:** marcas registradas, governança ou decisões institucionais

## 1. Regra principal

`Portal/UI` é uma classificação interna de trabalho, não um nome de produto.

A nomenclatura deve separar:

```text
produto
superfície
público
frente técnica
```

## 2. Forma recomendada

| Contexto | Nome recomendado |
|---|---|
| Superfície operacional transversal | Portal do `uni. Operador` |
| Nome curto em contexto claro | Portal |
| Produto técnico para desenvolvedores | API Developers Portal |
| Superfície institucional | Portal institucional da `uni.` |
| Superfície externa por cliente | Portal do cliente |
| Frente de implementação | Interface e experiência do Portal |
| Classificação de repositório | `portal-ui` ou `portal-interface` |

## 3. Forma a evitar

Evitar tratar como nome público:

- Portal/UI;
- UI Portal;
- Portal da API Developers, quando a referência for o `uni. Operador`;
- painel geral, quando houver execução assistida;
- admin, quando o escopo for transversal;
- central, quando o contexto não declarar público e autoridade.

## 4. Identificação em documentos

Documentos devem usar cabeçalho semelhante a:

```text
Produto: uni. Operador
Superfície: Portal web
Escopo: operação transversal
Frente técnica: interface e experiência
```

Para superfícies especializadas:

```text
Produto: API Developers
Superfície: Portal para desenvolvedores
Escopo: recursos técnicos autorizados
Frente técnica: interface e experiência
```

## 5. Rotas e código

Identificadores técnicos podem usar termos estáveis:

- `operator-portal`;
- `developer-portal`;
- `client-portal`;
- `media-portal`;
- `institutional-portal`;
- `portal-ui`;
- `portal-components`.

Identificadores técnicos não devem aparecer automaticamente como títulos públicos.

## 6. Marca e contexto

- `uni.` preserva o ponto final;
- `uni. Operador` identifica o operador;
- API Developers identifica o produto técnico;
- cliente identifica o escopo do tenant ou relacionamento;
- Portal descreve a superfície, não o núcleo inteiro.

## 7. Critérios de aceitação

- `Portal/UI` permanece apenas como classificação interna;
- o nome público da superfície transversal é Portal do `uni. Operador`;
- API Developers Portal é uma superfície especializada;
- portais de clientes são identificados pelo respectivo escopo;
- documentos separam produto, superfície e frente técnica;
- nenhuma nomenclatura concede autoridade implícita.
