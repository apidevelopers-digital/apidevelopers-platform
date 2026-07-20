# Estados de Tela do Portal

**Status:** proposta modular de interface  
**Escopo:** comportamento visual para carregamento, disponibilidade, ausência, erro e bloqueio  
**Não altera:** governança, contratos, autoridade ou estados canônicos

## 1. Princípio

Todo estado de tela deve explicar:

- o que está acontecendo;
- qual fonte está envolvida;
- se o conteúdo é atual ou projetado;
- o que o operador pode fazer agora;
- o que permanece bloqueado.

A interface nunca deve converter ausência de dados em sucesso presumido.

## 2. Estados fundamentais

| Estado | Tratamento |
|---|---|
| carregando | preservar contexto e indicar fonte consultada |
| disponível | mostrar conteúdo, origem, idade e reconciliação |
| vazio | explicar o que não foi encontrado e quais filtros estão ativos |
| desatualizado | manter conteúdo visível com alerta temporal |
| divergente | apresentar as versões conflitantes sem ocultar nenhuma |
| bloqueado | mostrar gate, requisito e autoridade necessária |
| erro | distinguir falha técnica de resposta válida sem dados |
| sem permissão | ocultar conteúdo protegido e explicar o escopo insuficiente |
| indisponível | indicar fonte não consultável e última evidência conhecida |
| parcial | separar dados disponíveis dos ainda ausentes |

## 3. Carregamento

O carregamento deve preservar:

- cabeçalho de contexto;
- filtros;
- item selecionado;
- estrutura da página;
- última projeção conhecida, quando segura.

Skeletons não podem simular valores reais. Indicadores devem informar se a operação consulta uma fonte, reconcilia projeções ou apenas monta a interface local.

## 4. Estado disponível

Um conteúdo disponível mostra:

- valor ou coleção;
- estado;
- `SourceRef`;
- instante da fonte;
- instante da projeção;
- nível de confiança;
- divergências;
- ações permitidas.

Disponível não significa aprovado, executado ou publicado.

## 5. Estado vazio

O estado vazio deve diferenciar:

1. nenhum item existe;
2. nenhum item corresponde aos filtros;
3. a fonte não foi consultada;
4. a projeção ainda não foi produzida;
5. o operador não possui permissão.

Cada caso recebe mensagem e ação adequadas. “Tudo certo” não é mensagem válida para ausência de resultados.

## 6. Estado desatualizado

Conteúdo desatualizado permanece legível quando não houver risco de interpretação errada, acompanhado de:

- idade do dado;
- limiar esperado;
- fonte;
- última reconciliação;
- opção de atualizar;
- efeitos conhecidos da desatualização.

Ações sensíveis podem permanecer bloqueadas até nova reconciliação.

## 7. Estado divergente

A divergência deve apresentar:

- valor projetado;
- valor da fonte;
- instante de cada lado;
- campos divergentes;
- impacto;
- próxima ação permitida;
- histórico de tentativas de reconciliação.

A interface não escolhe automaticamente um lado como verdade canônica.

## 8. Estado bloqueado

O bloqueio mostra:

- ação pretendida;
- gate responsável;
- requisito ausente;
- autoridade necessária;
- evidência esperada;
- reversibilidade;
- caminho para preparação ou aprovação.

Botões bloqueados devem explicar o motivo. Controles invisíveis só são aceitáveis quando o usuário não possui permissão para conhecer a ação.

## 9. Estado de erro

Erros devem ser classificados:

- falha de rede;
- timeout;
- fonte indisponível;
- autenticação inválida;
- autorização insuficiente;
- payload incompatível;
- reconciliação falha;
- erro desconhecido.

A mensagem apresenta identificador de correlação sem expor segredo ou payload sensível.

## 10. Estado parcial

Quando múltiplas fontes compõem uma tela, a interface deve mostrar por bloco:

- fonte consultada;
- fonte pendente;
- dado disponível;
- dado ausente;
- confiança;
- impacto da ausência.

Uma falha parcial não pode apagar dados válidos de outras fontes.

## 11. Transições

Transições visuais permitidas:

```text
carregando -> disponível
carregando -> vazio
carregando -> parcial
carregando -> erro
disponível -> desatualizado
disponível -> divergente
divergente -> reconciliado
qualquer estado -> sem permissão
```

A interface deve registrar mudanças relevantes na trilha de atividade quando houver projeção correspondente.

## 12. Critérios de aceitação

- ausência de dados nunca aparece como sucesso;
- cada estado oferece contexto e próxima ação;
- bloqueios explicam o gate;
- erros não expõem segredos;
- estados parciais preservam dados válidos;
- divergências mostram os dois lados;
- carregamento não simula valores reais;
- ações sensíveis respeitam atualização e reconciliação.
