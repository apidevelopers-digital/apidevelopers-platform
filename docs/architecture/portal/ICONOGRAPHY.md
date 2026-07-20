# Iconografia do Portal

**Status:** proposta modular de design  
**Escopo:** ícones informativos, operacionais e de risco  
**Não altera:** governança, estados canônicos, autoridade ou gates

## 1. Princípios

Ícones devem acelerar leitura sem substituir texto.

Todo ícone relevante deve possuir:

- rótulo acessível;
- significado estável;
- alternativa textual;
- contraste suficiente;
- uso consistente entre telas.

## 2. Famílias

| Família | Uso |
|---|---|
| navigation | rotas, retorno e expansão |
| state | saudável, atenção, bloqueio, erro e desconhecido |
| evidence | origem, validade, conflito e expiração |
| gate | satisfeito, pendente, falho e não avaliado |
| action | leitura, preparação, aprovação e execução |
| temporal | atualização, idade e reconciliação |
| audit | evento, ator, decisão e histórico |
| security | permissão, segredo omitido e escopo protegido |

## 3. Estados

O mesmo estado deve usar o mesmo símbolo em todas as superfícies.

Regras:

- saudável não usa símbolo de aprovação;
- bloqueado não é confundido com erro;
- desconhecido não é confundido com indisponível;
- divergente deve indicar comparação;
- desatualizado deve indicar temporalidade;
- parcial deve indicar cobertura incompleta.

## 4. Ações

Ícones de ação nunca devem aparecer sem verbo quando houver risco operacional.

Exemplos:

- Ver evidência;
- Preparar ajuste;
- Solicitar aprovação;
- Executar aprovado;
- Verificar resultado;
- Reconciliar projeção.

## 5. Ações sensíveis

Ações sensíveis devem:

- usar ícone distinto de ações comuns;
- permanecer separadas da navegação;
- informar risco e escopo;
- não depender apenas de cor;
- exigir confirmação conforme a ferramenta;
- nunca usar símbolo lúdico ou ambíguo.

## 6. Tamanho e alinhamento

Ícones devem:

- alinhar-se ao texto correspondente;
- manter área de toque acessível;
- não reduzir excessivamente em modo compacto;
- evitar detalhes finos em tamanhos pequenos;
- manter consistência de traço.

## 7. Animação

Animações só podem indicar:

- carregamento real;
- progresso mensurável;
- atualização concluída;
- mudança de estado.

Devem respeitar preferência por movimento reduzido e nunca simular atividade inexistente.

## 8. Segurança

Nunca usar ícones para revelar ou representar visualmente:

- tokens;
- senhas;
- chaves privadas;
- API Keys secretas;
- payloads sensíveis;
- credenciais.

Usar rótulos como `segredo omitido` ou `credencial protegida`.

## 9. Critérios de aceitação

- cada ícone operacional tem significado documentado;
- texto acompanha estados e riscos;
- ações sensíveis possuem símbolo e verbo explícitos;
- ícones continuam compreensíveis em tema claro e escuro;
- nenhuma ação depende exclusivamente de hover;
- leitores de tela recebem rótulos adequados;
- iconografia não presume sucesso, autoridade ou aprovação.
