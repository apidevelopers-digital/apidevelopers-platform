# Microcopy do Portal

**Status:** proposta modular de interface  
**Escopo:** mensagens curtas, rótulos, botões, alertas e confirmações  
**Não altera:** governança, decisões, autoridade, gates ou estados canônicos

## 1. Princípios

A microcopy do Portal deve:

- dizer o estado atual antes da ação;
- usar verbos concretos;
- separar preparar, solicitar, aprovar, executar e verificar;
- evitar promessas futuras;
- não presumir sucesso;
- indicar origem e temporalidade quando relevantes;
- explicar bloqueios sem culpar o operador;
- nunca expor segredos ou payloads sensíveis.

## 2. Verbos preferidos

| Intenção | Verbo |
|---|---|
| consultar | Ver |
| atualizar projeção | Atualizar |
| abrir evidência | Ver evidência |
| preparar alteração | Preparar ajuste |
| simular | Executar dry-run |
| solicitar decisão | Solicitar aprovação |
| registrar decisão | Aprovar / Rejeitar |
| executar ação autorizada | Executar aprovado |
| validar resultado | Verificar resultado |
| reconciliar fontes | Reconciliar |
| retornar estado anterior | Voltar |
| desfazer preferência local | Desfazer |

Evitar verbos vagos como `continuar`, `processar`, `resolver` ou `confirmar` sem objeto.

## 3. Estados

| Estado | Rótulo recomendado |
|---|---|
| saudável | Funcionando |
| atenção | Exige atenção |
| bloqueado | Bloqueado por gate |
| erro | Falha confirmada |
| desconhecido | Estado não confirmado |
| divergente | Fontes divergentes |
| desatualizado | Projeção desatualizada |
| parcial | Dados parciais |
| indisponível | Fonte indisponível |
| sem permissão | Acesso não autorizado |

## 4. Carregamento

Preferir:

- `Consultando projeções...`
- `Verificando evidências...`
- `Comparando fonte e projeção...`
- `Atualizando a fila operacional...`

Evitar:

- `Carregando...` sem contexto;
- percentuais quando o total de trabalho não for conhecido;
- mensagens que indiquem conclusão antes da verificação.

## 5. Estados vazios

Exemplos:

- `Nenhum item corresponde aos filtros atuais.`
- `A fonte ainda não foi consultada.`
- `Esta projeção ainda não foi gerada.`
- `Você não possui permissão para consultar este conteúdo.`
- `A fonte está indisponível. A última projeção válida foi gerada há 3 horas.`

Nunca usar `Tudo certo` para ausência de resultados.

## 6. Bloqueios

Estrutura:

```text
Ação bloqueada por [gate].
Falta: [requisito].
Próxima ação permitida: [ação].
```

Exemplos:

- `Execução bloqueada por aprovação ausente. Solicite a decisão da autoridade responsável.`
- `Publicação bloqueada porque o resultado do dry-run não foi verificado.`
- `Reconciliação bloqueada por fonte indisponível.`

## 7. Divergências

Exemplos:

- `A projeção e a fonte possuem valores diferentes.`
- `3 campos divergentes precisam de reconciliação.`
- `A fonte foi atualizada depois desta projeção.`
- `Nenhum lado foi escolhido automaticamente como verdade canônica.`

A mensagem deve oferecer `Comparar valores` ou `Ver histórico`, nunca `Aceitar automaticamente`.

## 8. Aprovações

### Preparação

- `Ajuste preparado para revisão.`
- `Nenhuma execução foi realizada.`
- `Dry-run concluído. Revise o impacto antes de solicitar aprovação.`

### Solicitação

- `Aprovação solicitada à autoridade responsável.`
- `A execução permanece bloqueada enquanto a decisão estiver pendente.`

### Decisão

- `Aprovação registrada para esta revisão e escopo.`
- `Proposta rejeitada. Nenhuma execução foi realizada.`
- `A aprovação expirou e não pode mais ser usada.`

### Mudança material

- `A proposta mudou depois da aprovação. Solicite uma nova decisão.`

## 9. Execução

Antes:

- `Revise escopo, impacto e reversibilidade.`
- `Esta ação exige confirmação explícita da ferramenta.`
- `A aprovação é válida somente para a revisão exibida.`

Durante:

- `Execução solicitada. Resultado ainda não verificado.`
- `A ferramenta aceitou a operação. Aguardando evidência posterior.`

Depois:

- `Operação concluída e verificada.`
- `Operação concluída com divergências.`
- `Solicitação aceita, mas o resultado ainda não foi confirmado.`
- `A operação falhou. O estado anterior foi preservado.`

## 10. Erros

Formato:

```text
[Etapa] falhou.
Impacto: [impacto].
Estado preservado: [estado].
Próxima ação: [ação segura].
Correlação: [identificador].
```

Exemplo:

`A reconciliação falhou. A projeção anterior foi preservada. Tente novamente após verificar a fonte. Correlação: op_7F2A.`

## 11. Retry

Usar:

- `Tentar novamente`
- `Repetir consulta`
- `Gerar nova projeção`
- `Reexecutar dry-run`

Não oferecer retry quando:

- o estado remoto for desconhecido;
- houver risco de duplicar efeitos;
- a aprovação tiver expirado;
- os parâmetros tiverem mudado.

## 12. Confirmações sensíveis

Títulos:

- `Executar ajuste aprovado?`
- `Publicar nesta revisão?`
- `Reconciliar estes valores?`
- `Cancelar esta solicitação?`

Corpo:

- objeto;
- escopo;
- impacto;
- reversibilidade;
- gate;
- evidências;
- confirmação exigida.

Botões:

- `Voltar`
- `Executar aprovado`

Evitar `Sim` e `Não` sem ação explícita.

## 13. Temporalidade

Exemplos:

- `Atualizado há 4 minutos`
- `Fonte consultada em 20 jul 2026, 19:34`
- `Projeção 18 horas mais antiga que a fonte`
- `Reconciliação pendente desde 20 jul 2026`

Datas relativas devem oferecer a data absoluta em contexto acessível.

## 14. Permissões

Exemplos:

- `Você pode consultar este item, mas não preparar ações.`
- `Esta ação exige autoridade adicional.`
- `O conteúdo está protegido pelo escopo atual.`
- `Solicite acesso ao responsável pelo domínio.`

A interface não deve revelar conteúdo protegido na explicação.

## 15. Critérios de aceitação

- botões usam verbo e objeto;
- mensagens distinguem solicitação, execução e verificação;
- sucesso exige evidência;
- bloqueios indicam gate e próxima ação;
- erros informam impacto e estado preservado;
- ausência de dados não aparece como sucesso;
- confirmações sensíveis explicam escopo e reversibilidade;
- nenhuma microcopy expõe segredo ou credencial.
