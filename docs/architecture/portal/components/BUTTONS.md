# Contrato de Botões do Portal

**Status:** proposta modular de componente  
**Escopo:** ações de leitura, preparação, aprovação e execução  
**Não altera:** autoridade, gates, classificação de risco ou políticas institucionais

## 1. Propósito

O componente de botão deve explicar claramente:

- verbo da ação;
- objeto afetado;
- nível de risco visual;
- estado do gate;
- confirmação exigida;
- reversibilidade;
- resultado esperado.

## 2. Variantes

|Variante | Uso |
|---|---|
| lead | ação principal de uma escolha não sensível |
| secondary | ação complementar |
| quiet | ação de leitura ou navegação |
| prepare | preparação, dry-run ou comparação |
| approve | solicitação ou decisão de autoridade |
| execute | execução sensível autorizada |
| destructive | ação irreversível ou de alto impacto |

## 3. Propriedades

```text
label
actionKey
variant
disabled
loading
riskLevel
gateState
confirmationMode
reversible
evidenceRequired
sourceRef
correlationId
```

## 4. Estados

- default;
- hover;
- focus;
- active;
- disabled;
- loading;
- blocked;
- awaiting-approval;
- error;
- completed.

O estado `completed` só pode aparecer quando houver evidência posterior válida.

## 5. Desabilitação

Botão desabilitado deve mostrar o motivo com texto acessível.

Motivos válidos:

- gate não satisfeito;
- autoridade insuficiente;
- projeção desatualizada;
- divergência não reconciliada;
- evidência ausente;
- operação em andamento;
- parâmetros inválidos.

## 6. Loading

Durante o carregamento:

- preservar largura do botão;
- manter r ítulo accessível;
- bloquear duplo disparo;
- mostrar etapa atual;

- não presumir conclusão.

## 7. Confirmação

Modos de confirmação:

| Modo | Uso |
|---|---|
| none | leitura e navegação |
| review | preparação com impacto visível |
| explicit | execução sensível |
| strong | ação destrutiva ou ireversível |

A interface não inventa a frase de confirmação exigida por ferramenta externa.

## 8. Acessibilidade

- todo botão é operável por teclado;
- o foco é visível;
- ícone não substitui rótulo;
- estado desabilitado é anunciado;
- loading é anunciado;
- ações sensíveis têm verbo e objeto.

## 9. Critérios de aceitação

- nenhum botão usa rótulo genérico como “continuar”;
- botões de execução não se confundem com navegação;
- botão desabilitado explica o motivo;
- carregamento bloqueia duplo disparo;
- sucesso exige evidência;
- ações sensíveis exigem confirmação proporcional;
- segredos não sC�o expostos em propriedades ou eventos.
