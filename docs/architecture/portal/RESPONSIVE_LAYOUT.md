# Layout Responsivo do Portal

**Status:** proposta modular de interface  
**Escopo:** comportamento das superfícies do Portal em diferentes larguras e contextos de uso  
**Não altera:** governança, contratos canônicos, autoridade ou projeções institucionais

## 1. Objetivo

O layout responsivo deve preservar contexto, rastreabilidade e próxima ação permitida em qualquer largura.

A redução de espaço nunca pode ocultar:

- estado operacional;
- origem da projeção;
- idade do dado;
- divergências;
- gates;
- evidências;
- bloqueios;
- autoridade necessária.

## 2. Faixas conceituais

| Faixa | Uso principal |
|---|---|
| compacta | celular, janela estreita e consulta rápida |
| intermediária | tablet, notebook pequeno e operação dividida |
| ampla | desktop operacional e análise detalhada |
| expandida | monitores grandes e centros de operação |

As faixas são conceitos de produto. A implementação pode definir pontos de quebra específicos sem alterar o contrato de conteúdo.

## 3. Estrutura adaptativa

### Compacta

Ordem recomendada:

1. cabeçalho de contexto;
2. estado e alertas;
3. resumo operacional;
4. filtros ativos;
5. fila principal;
6. detalhes do item;
7. evidências;
8. ações permitidas.

Painéis laterais tornam-se páginas, drawers ou seções sequenciais. Nenhuma informação crítica depende de hover.

### Intermediária

A interface pode usar duas regiões:

- navegação ou fila;
- conteúdo e detalhes.

Filtros avançados podem abrir em painel temporário. Evidências permanecem a uma transição do item selecionado.

### Ampla

A superfície pode usar três regiões:

- navegação;
- fila ou conteúdo principal;
- painel de detalhes.

O painel de detalhes não pode alterar silenciosamente o item selecionado.

### Expandida

A largura adicional deve melhorar comparação e monitoramento, não apenas aumentar espaços vazios.

É permitido exibir simultaneamente:

- fila;
- detalhes;
- evidências;
- histórico;
- ações permitidas.

## 4. Prioridade de conteúdo

Quando houver redução de espaço, preservar nesta ordem:

1. estado;
2. identificação;
3. gate ou bloqueio;
4. próxima ação;
5. origem;
6. idade da projeção;
7. evidências;
8. metadados complementares.

Campos removidos da visão inicial devem continuar acessíveis por expansão explícita.

## 5. Navegação responsiva

A navegação deve preservar:

- rota atual;
- contexto ativo;
- filtros;
- item selecionado;
- retorno sem perda de estado.

Em largura compacta, a navegação global pode ser recolhida, mas alertas críticos e contexto atual continuam visíveis.

## 6. Tabelas

Tabelas devem adotar uma destas estratégias:

- rolagem horizontal com primeira coluna fixa;
- redução de colunas com detalhes expansíveis;
- transformação em lista estruturada;
- agrupamento por prioridade operacional.

Nunca:

- truncar identificadores sem forma de revelar o valor completo;
- ocultar estado ou gate;
- converter múltiplas colunas críticas em texto ambíguo;
- depender apenas de cor.

## 7. Filtros

Em largura compacta:

- filtros ativos aparecem como chips removíveis;
- filtros avançados usam painel dedicado;
- a quantidade de resultados permanece visível;
- limpar filtros exige ação explícita.

O retorno da página de detalhes preserva todos os filtros e a posição da fila.

## 8. Ações

Ações de leitura podem permanecer próximas ao conteúdo.

Ações sensíveis devem:

- ocupar região separada;
- exibir estado do gate;
- informar autoridade necessária;
- exigir confirmação da ferramenta;
- permanecer desabilitadas quando a projeção estiver desatualizada ou divergente.

Em largura compacta, ações sensíveis não devem ficar próximas de controles de navegação.

## 9. Estados e feedback

Banners persistentes ocupam o topo da superfície afetada, não obrigatoriamente o topo global.

Mensagens de:

- divergência;
- bloqueio;
- perda de conexão;
- projeção desatualizada;
- execução ainda não verificada;

devem continuar visíveis após mudanças de largura.

## 10. Comparação

Comparações entre projeção e fonte devem preservar os dois lados.

Em telas compactas, usar:

- blocos sequenciais identificados;
- alternância explícita;
- destaque de campos divergentes;
- resumo fixo da diferença.

A interface nunca escolhe automaticamente um lado como verdadeiro.

## 11. Critérios de aceitação

- contexto e filtros sobrevivem a mudanças de largura;
- estado, gate e origem nunca desaparecem;
- nenhuma ação sensível depende de hover;
- tabelas continuam compreensíveis em largura compacta;
- evidências permanecem alcançáveis em até duas transições;
- comparação preserva os dois lados;
- controles de navegação não se confundem com execução sensível;
- mudança de layout não altera estado operacional.
