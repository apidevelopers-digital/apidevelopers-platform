# Acessibilidade do Portal

**Status:** contrato inicial de experiência inclusiva  
**Escopo:** navegação, leitura, interação, feedback e operação assistida  
**Não altera:** governança, autoridade, gates ou contratos institucionais

## 1. Princípio

Acessibilidade faz parte do contrato operacional do Portal.

Nenhum estado, bloqueio, divergência, evidência ou ação permitida pode depender exclusivamente de:

- cor;
- posição;
- animação;
- som;
- hover;
- precisão motora;
- memória visual.

## 2. Estrutura semântica

Cada superfície deve possuir:

- título principal único;
- regiões identificáveis;
- hierarquia de cabeçalhos coerente;
- navegação principal;
- conteúdo principal;
- região de alertas;
- região de ações;
- tabelas com cabeçalhos semânticos.

Mudanças de rota devem atualizar título e foco de maneira previsível.

## 3. Teclado

Toda operação deve ser possível por teclado.

Requisitos:

- ordem de foco acompanha a leitura;
- foco visível;
- ausência de armadilhas de teclado;
- modais devolvem foco ao acionador;
- drawers e menus podem ser fechados por teclado;
- atalhos não conflitam com tecnologias assistivas;
- ações sensíveis nunca são disparadas por tecla única sem confirmação.

## 4. Leitores de tela

Componentes dinâmicos devem anunciar:

- carregamento iniciado;
- carregamento concluído;
- falha;
- mudança de estado;
- atualização de resultado;
- bloqueio;
- conclusão confirmada;
- execução ainda não verificada.

Notificações transitórias não podem desaparecer antes de serem percebidas por tecnologia assistiva.

## 5. Estados visuais

Cada estado combina:

- texto;
- ícone;
- padrão visual;
- descrição acessível.

Exemplo:

| Estado | Texto mínimo |
|---|---|
| saudável | estado confirmado por evidência válida |
| atenção | dado parcial, atrasado ou incompleto |
| bloqueado | gate obrigatório não satisfeito |
| erro | falha confirmada |
| desconhecido | evidência insuficiente |
| divergente | projeção e fonte não reconciliadas |

## 6. Contraste e legibilidade

O design deve garantir contraste suficiente para:

- texto;
- ícones;
- bordas relevantes;
- foco;
- gráficos;
- estados desabilitados;
- mensagens críticas.

Texto operacional não deve ser inserido em imagens.

## 7. Escala e zoom

A interface deve permanecer utilizável com:

- zoom elevado;
- aumento de tamanho de fonte;
- espaçamento de texto personalizado;
- orientação vertical e horizontal;
- janela estreita.

A ampliação não pode remover ações, origem ou gate.

## 8. Movimento

Animações devem ser reduzidas quando o usuário preferir menos movimento.

Não usar movimento para:

- indicar exclusivamente uma falha;
- esconder conteúdo crítico;
- controlar tempo de leitura;
- simular progresso não mensurável.

Atualizações frequentes devem evitar deslocamento inesperado de conteúdo.

## 9. Formulários

Todo campo deve possuir:

- rótulo persistente;
- descrição quando necessária;
- erro associado;
- formato esperado;
- indicação de obrigatoriedade;
- estado desabilitado explicado.

Erros devem ser apresentados no resumo e junto ao campo correspondente.

## 10. Confirmações e risco

Confirmações sensíveis devem informar:

- ação;
- objeto;
- escopo;
- impacto;
- reversibilidade;
- autoridade;
- estado do gate.

A confirmação não pode depender apenas da diferença entre cores dos botões.

## 11. Tabelas e dados densos

Tabelas devem permitir:

- leitura linear;
- associação entre célula e cabeçalho;
- navegação por teclado;
- descrição de ordenação;
- indicação de filtros;
- expansão acessível de detalhes.

Gráficos devem possuir resumo textual e alternativa tabular quando carregarem informação operacional.

## 12. Linguagem

Mensagens devem ser:

- diretas;
- específicas;
- orientadas a estado;
- livres de culpa;
- consistentes com o vocabulário canônico.

Evitar:

- “algo deu errado” sem contexto;
- “sucesso” sem evidência;
- instruções baseadas apenas em posição;
- abreviações sem expansão;
- jargão não documentado.

## 13. Critérios de aceitação

- todo fluxo é operável por teclado;
- foco é visível e previsível;
- mudanças importantes são anunciadas;
- estados não dependem apenas de cor;
- zoom e aumento de texto preservam o conteúdo;
- formulários possuem rótulos e erros associados;
- gráficos têm alternativa textual;
- ações sensíveis expõem escopo e impacto;
- nenhuma informação crítica depende de hover ou animação.
