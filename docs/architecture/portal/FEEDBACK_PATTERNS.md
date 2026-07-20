# Padrões de Feedback Operacional

**Status:** proposta modular de interface  
**Escopo:** mensagens, notificações, progresso, confirmação e evidência  
**Não altera:** governança, decisões, gates ou contratos institucionais

## 1. Objetivo

O feedback operacional deve permitir que o operador entenda:

- qual ação foi solicitada;
- qual etapa está em andamento;
- qual resultado foi obtido;
- qual evidência sustenta o resultado;
- qual próximo passo é permitido.

Feedback visual não substitui evidência técnica.

## 2. Níveis de feedback

| Nível | Uso |
|---|---|
| informativo | contexto sem necessidade de ação |
| atenção | condição parcial, atraso ou risco moderado |
| bloqueio | requisito obrigatório não satisfeito |
| erro | falha confirmada |
| sucesso | resultado confirmado por evidência válida |
| progresso | operação ainda em andamento |
| divergência | fontes ou projeções incompatíveis |

Cor, ícone e texto devem aparecer juntos.

## 3. Mensagens transitórias

Toasts servem apenas para:

- confirmar interação local;
- informar que uma atualização foi solicitada;
- indicar que um item foi copiado;
- avisar que uma preferência foi salva.

Toasts não devem ser a única evidência de ação sensível, aprovação, execução ou falha crítica.

## 4. Mensagens persistentes

Banners e painéis persistentes são obrigatórios para:

- divergências;
- bloqueios;
- falhas de reconciliação;
- dados desatualizados;
- permissões insuficientes;
- operações sensíveis em andamento;
- resultados sem evidência posterior.

A mensagem permanece até mudança comprovada de estado.

## 5. Progresso

Operações com múltiplas etapas mostram:

- etapa atual;
- etapas concluídas;
- etapas pendentes;
- instante de início;
- fonte ou ferramenta;
- possibilidade de cancelamento, quando suportada;
- impacto de fechar a tela;
- identificador de correlação.

Percentuais só podem ser usados quando o total de trabalho for conhecido.

## 6. Confirmação

Confirmações são proporcionais ao risco:

| Risco | Padrão |
|---|---|
| leitura | execução direta |
| preparação | confirmação leve quando houver perda de edição |
| aprovação | revisão de escopo e autoridade |
| execução sensível | confirmação explícita exigida pela ferramenta |
| destrutiva | resumo de impacto, reversibilidade e confirmação forte |

A interface nunca inventa a frase de confirmação exigida por uma ferramenta.

## 7. Resultado

Todo resultado operacional relevante deve apresentar:

- status;
- objeto ou escopo;
- instante;
- origem;
- evidência;
- alterações observadas;
- divergências;
- próximo estado permitido.

“Concluído” só aparece quando a projeção possui evidência suficiente.

## 8. Falha

Uma falha deve explicar:

- etapa afetada;
- categoria;
- impacto;
- o que permaneceu inalterado;
- possibilidade de retry;
- necessidade de nova aprovação;
- evidência disponível;
- identificador de correlação.

Retry não deve ser oferecido quando puder duplicar efeito ou quando o estado remoto for desconhecido.

## 9. Ações otimistas

Atualizações otimistas são permitidas apenas para preferências locais e interações reversíveis sem impacto institucional.

Estados operacionais, aprovações, execução e evidências não usam confirmação otimista.

## 10. Desfazer

A opção de desfazer pode ser usada para:

- filtros;
- preferências;
- organização visual;
- alterações locais ainda não submetidas.

Rollback operacional deve ser tratado como ação própria, com escopo, autoridade, gate e evidência.

## 11. Linguagem

Mensagens devem:

- usar verbos concretos;
- indicar estado atual;
- evitar “talvez tenha funcionado”;
- não prometer resultado futuro;
- diferenciar preparado, solicitado, aprovado, executado e verificado;
- usar datas e horários quando relevantes;
- não expor segredos ou payloads sensíveis.

## 12. Exemplos

### Preparação concluída

```text
Ajuste preparado para revisão.
Nenhuma execução foi realizada.
```

### Aprovação pendente

```text
Aguardando decisão da autoridade responsável.
A execução permanece bloqueada.
```

### Execução sem evidência final

```text
A ferramenta aceitou a solicitação.
O resultado ainda não foi verificado.
```

### Resultado confirmado

```text
Operação concluída e verificada.
Evidência técnica vinculada ao registro.
```

## 13. Critérios de aceitação

- toasts não carregam estados críticos sozinhos;
- sucesso exige evidência;
- progresso distingue etapa e conclusão;
- confirmação respeita risco e ferramenta;
- falhas informam impacto e retry seguro;
- rollback não é tratado como simples desfazer;
- linguagem diferencia preparação, aprovação, execução e verificação;
- feedback não expõe dados sensíveis.
