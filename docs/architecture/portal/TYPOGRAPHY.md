# Tipografia do Portal

**Status:** proposta modular de design  
**Escopo:** hierarquia, legibilidade, densidade e uso tipográfico em superfícies operacionais  
**Não altera:** governança, estados canônicos, autoridade ou contratos institucionais

## 1. Princípios

A tipografia deve priorizar:

- leitura rápida;
- distinção entre estado, evidência e ação;
- estabilidade visual;
- acessibilidade;
- compatibilidade com diferentes densidades;
- ausência de ambiguidade entre conteúdo operacional e metadados.

## 2. Papéis tipográficos

| Papel | Uso |
|---|---|
| display | títulos de contexto amplo e páginas institucionais |
| heading | títulos de tela, seção e painel |
| body | explicações, resumos e mensagens |
| label | rótulos de campos, filtros e controles |
| data | valores operacionais, métricas e estados |
| code | IDs, hashes, branches, revisões e referências técnicas |
| caption | temporalidade, origem e metadados auxiliares |

## 3. Hierarquia

A ordem mínima é:

1. título da tela;
2. estado operacional;
3. resumo;
4. seção;
5. conteúdo;
6. metadados;
7. origem e temporalidade.

Estado e gate devem ter peso visual superior a metadados complementares.

## 4. Escala

A escala deve ser limitada, previsível e responsiva.

Regras:

- não usar tamanho como único sinal de hierarquia;
- preservar legibilidade em zoom elevado;
- evitar textos operacionais abaixo do tamanho mínimo acessível;
- reduzir espaçamento antes de reduzir tamanho;
- manter IDs técnicos em fonte monoespaçada;
- permitir quebra de linha em hashes e caminhos longos.

## 5. Peso e ênfase

Usar peso para:

- título;
- estado;
- bloqueio;
- ação principal;
- diferença crítica.

Não usar peso excessivo em toda a interface. Itálico não deve carregar estado ou risco sozinho.

## 6. Dados técnicos

Branches, commits, IDs e hashes devem:

- usar estilo monoespaçado;
- permitir seleção e cópia;
- preservar caracteres completos;
- oferecer expansão quando truncados;
- nunca ser substituídos apenas por apelidos visuais.

## 7. Texto em tabelas

Tabelas devem manter:

- cabeçalhos distinguíveis;
- alinhamento consistente;
- números comparáveis;
- estados legíveis;
- células técnicas expansíveis;
- leitura linear por tecnologia assistiva.

## 8. Tema claro e escuro

A tipografia deve preservar:

- contraste;
- peso aparente;
- diferenciação entre texto primário e secundário;
- visibilidade de foco;
- legibilidade de código;
- estados desabilitados sem desaparecer.

## 9. Critérios de aceitação

- títulos e estados são distinguíveis sem depender de cor;
- zoom não remove conteúdo crítico;
- IDs técnicos permanecem copiáveis;
- texto secundário continua legível;
- densidade não reduz tipografia abaixo do mínimo;
- código e conteúdo narrativo são visualmente distintos;
- tipografia não cria autoridade implícita.
