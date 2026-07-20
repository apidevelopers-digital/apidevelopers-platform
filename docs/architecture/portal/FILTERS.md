# Filtros e Consultas do Portal

**Status:** proposta modular de interface  
**Escopo:** filtragem, busca e consultas sobre projecoes  
**Nao altera:** estados, prioridades, gates, autoridade ou fontes canonicas

## 1. Principios

1. Filtros reduzem a visao, mas nao mutam o estado projetado.

2. Todo filtro ativo deve permanecer visivel.
3. Ausencia de resultado nao pode ser apresentada como sucesso.
4. Consultas devem preservar origem, instante e nexe de confianca.
5. Filtros salvos sao preferencias de interface, nao decisoes institucionais.

## 2. Dimensoes de filtragem

| Dimensao | Exemplos |
|---|---|
| Estado | saudavel, atencao, bloqueado, erro, desconhecido, divergente |
| Dominio | tenant, projeto, apikey, usage, billing, ativacao |
| Gate | pendente, satisfeito, falho, nao avaliado |
| Evidencia | valida, ausente, expirada, conflitante, nao verificavel |
| Tempo | recente, desatualizado, intervalo personalizado |
| Origem | branch, commit, workflow, documento, projecao |
| Autoridade | leitura, preparacao, aprovacao, execucao |

Filtros combinados devem indicar claramente se usam intersecao ou uniao.

## 3. Busca global

A busca global aceita:

- identificadores;
- nomes de dominios;
- componentes;
- contratos;
- commits;
- evidencias;
- eventos auditaveis;
- referencias de fonte.

Cada resultado exibe tipo, origem, estado, data de atualizacao e confianca.

## 4. Queries salvas

Uma consulta salva contem:

- nome curto;
- filtros;
- ordenacao;
- colunas visiveis;
- densidade;
- escopo de contexto;
- autor da preferencia;
- data da ultima alteracao.

Queries salvas nao podem fixar estados como se fossem fatos atuais. Ao abrir, o Portal reconstrui a visao com a projecao atual.

## 5. Ordenacao

Ordenacoes permitidas:

- prioridade derivada;
- ultima atualizacao;
- idade da projecao;
- estado;
- dominio;
- gate;
- quantidade de evidencias.

A criterio de ordenacao nao pode alterar prioridade, gate, autoridade ou estado canonico.

## 6. Estado vazio

Quando a consulta nao retornar resultados, a interface mostra:

- filtros ativos;
- escopo consultado;
- fontes consultadas;
- fontes nao consultadas;
- opcao de limpar filtros;
- opcao de ampear o intervalo;
- estado de reconciliacao.

O estado vazio nao deve usar mensagem de sucesso.

## 7. Filtros rapidos

Atalhos sugeridos:

- Exige atencao;
- Bloqueados;
- Divergentes;
- Sem evidencia;
- Aguardando aprovacao;
- Preparados para revisao;
- Atualizados nas derradeiras 24 horas.

Cada atalho e um filtro explicito e dispensavel.

## 8. URL ou estado compartilhavel

O Portal pode preservar na URL ou estado compartilhavel:

- filtros;
- ordenacao;
- superficie selecionada;
- item aberto;
- intervalo temporal;

- densidade.

Dados sensiveis, segredos ou credenciais nunca fazem parte do estado compartilhado.

## 9. Criterios de aceitaco

- filtros ativos permanecem visiveis;
- consultas salvas sao reconstruidas com dados atuais;
- estado vazio nao equivale a sucesso;
- ordenacao nao muta prioridade ou gates;
- busca global preserva origem e confianca;
- o estado compartilhavel nao contem segredos.
