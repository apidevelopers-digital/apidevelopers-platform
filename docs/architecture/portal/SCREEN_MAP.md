# Mapa de Telas do Portal

**Status:** proposta modular de interface  
**Escopo:** inventário conceitual das superfícies operacionais  
**Não altera:** governança, contratos canônicos, autoridade ou gates

## 1. Objetivo

O mapa de telas organiza a experiência do Portal sem transformar rotas visuais em novos contratos institucionais.

Cada superfície deve declarar:

- projeção consumida;
- contexto ativo;
- estados suportados;
- evidências exibidas;
- ações permitidas;
- gates aplicáveis;
- retorno esperado.

## 2. Superfícies principais

| Superfície | Finalidade |
|---|---|
| Visão geral | resumir saúde, atenção, bloqueios e mudanças recentes |
| Fila operacional | priorizar itens que exigem leitura, preparação ou decisão |
| Domínios | navegar pelas projeções de cada domínio |
| Detalhe do item | reunir estado, origem, evidências, histórico e ações |
| Gates | mostrar requisitos satisfeitos, pendentes ou falhos |
| Divergências | comparar projeção e fonte sem escolher automaticamente um lado |
| Evidências | consultar origem, validade, temporalidade e correlação |
| Aprovações | preparar, solicitar, decidir e acompanhar autorizações |
| Auditoria | consultar eventos, mudanças e decisões registradas |
| Configuração | controlar preferências locais da interface |

## 3. Hierarquia de navegação

```text
Visão geral
├── Fila operacional
│   ├── Item operacional
│   ├── Gates
│   ├── Evidências
│   └── Histórico
├── Domínios
│   └── Detalhe do domínio
├── Divergências
├── Aprovações
├── Auditoria
└── Configuração
```

## 4. Visão geral

A tela inicial deve mostrar:

- contexto e revisão consultados;
- idade da projeção;
- contagem por estado;
- gates críticos;
- divergências abertas;
- mudanças recentes;
- próximas ações permitidas.

Nenhum card pode apresentar sucesso sem evidência válida.

## 5. Fila operacional

A fila suporta:

- filtros por estado, domínio, gate e temporalidade;
- ordenação por prioridade derivada;
- seleção persistente;
- densidade configurável;
- abertura do detalhe sem perda de contexto;
- retorno preservando posição e filtros.

## 6. Detalhe do item

Estrutura mínima:

1. identificação;
2. estado atual;
3. origem e `SourceRef`;
4. temporalidade;
5. dependências;
6. gates;
7. evidências;
8. divergências;
9. histórico;
10. ações permitidas.

A página deve distinguir claramente projeção, fonte e decisão institucional.

## 7. Gates

A superfície de gates deve permitir:

- agrupar por domínio ou impacto;
- identificar requisito ausente;
- abrir evidência relacionada;
- explicar autoridade necessária;
- mostrar ação de preparação disponível;
- impedir execução quando o gate não estiver satisfeito.

## 8. Divergências

Cada divergência apresenta:

- valor projetado;
- valor da fonte;
- instante de cada lado;
- campos conflitantes;
- impacto;
- estado de reconciliação;
- histórico de tentativas;
- próxima ação permitida.

A interface não seleciona automaticamente uma versão como canônica.

## 9. Evidências

A superfície deve listar:

- tipo;
- origem;
- identificador;
- revisão ou hash;
- instante;
- validade;
- confiança;
- objetos correlacionados.

Segredos e payloads sensíveis não são exibidos.

## 10. Aprovações

A tela separa:

- rascunhos;
- preparadas;
- aguardando decisão;
- aprovadas;
- rejeitadas;
- expiradas;
- consumidas;
- canceladas.

Aprovação nunca equivale automaticamente a execução.

## 11. Auditoria

A auditoria deve permitir navegar por:

- evento;
- objeto;
- domínio;
- ator;
- intervalo temporal;
- decisão;
- execução;
- evidência posterior.

## 12. Estados transversais

Todas as superfícies suportam:

- carregando;
- disponível;
- vazio;
- parcial;
- desatualizado;
- divergente;
- bloqueado;
- erro;
- indisponível;
- sem permissão.

## 13. Critérios de aceitação

- toda tela declara sua projeção de origem;
- contexto e temporalidade permanecem visíveis;
- ações sensíveis não se confundem com navegação;
- retorno preserva filtros e seleção;
- divergências mostram os dois lados;
- ausência de evidência nunca aparece como sucesso;
- nenhuma rota cria autoridade implícita.
