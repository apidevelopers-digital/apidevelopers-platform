# Padrões Visuais de Risco do Portal

**Status:** proposta modular de design  
**Escopo:** apresentação visual de risco, bloqueio, divergência e ações sensíveis  
**Não altera:** matriz de risco, autoridade, gates ou políticas institucionais

## 1. Princípio

A interface representa risco; ela não o redefine.

Toda apresentação de risco deve informar:

- nível ou categoria disponível;
- causa;
- impacto;
- escopo;
- reversibilidade;
- autoridade necessária;
- evidências;
- próxima ação permitida.

## 2. Categorias visuais

| Categoria | Uso |
|---|---|
| informativo | contexto sem ação obrigatória |
| atenção | condição parcial, atrasada ou incompleta |
| bloqueio | gate obrigatório não satisfeito |
| erro | falha confirmada |
| crítico | impacto alto ou irreversível |
| divergência | fontes ou projeções incompatíveis |
| desconhecido | ausência de evidência suficiente |

As categorias não substituem classificações institucionais de risco.

## 3. Estrutura do alerta

Todo alerta persistente deve conter:

```text
Título
Causa
Impacto
Escopo
Evidência
Estado do gate
Próxima ação permitida
```

## 4. Bloqueio

Um bloqueio deve:

- explicar qual ação está impedida;
- identificar o gate;
- mostrar o requisito ausente;
- indicar autoridade necessária;
- oferecer somente ações de preparação ou consulta permitidas;
- permanecer visível enquanto a condição existir.

## 5. Erro

Erro deve ser diferenciado de:

- estado desconhecido;
- fonte indisponível;
- falta de permissão;
- dado parcial;
- divergência.

A mensagem deve informar o que permaneceu inalterado e se existe retry seguro.

## 6. Crítico

Padrões críticos exigem:

- região visual separada;
- linguagem direta;
- confirmação explícita;
- resumo de impacto;
- informação de reversibilidade;
- ausência de atalhos acidentais;
- foco gerenciado para tecnologia assistiva.

## 7. Divergência

A divergência deve mostrar os dois lados com peso equivalente:

- projeção;
- fonte;
- instante de cada valor;
- campos conflitantes;
- impacto;
- histórico de reconciliação.

A interface nunca escolhe automaticamente um lado como verdade canônica.

## 8. Ação destrutiva

Ações destrutivas devem:

- usar verbo e objeto explícitos;
- informar escopo;
- separar-se de ações comuns;
- mostrar consequência;
- declarar reversibilidade;
- exigir confirmação da ferramenta;
- não utilizar confirmação genérica `Sim/Não`.

## 9. Temporalidade

Risco relacionado ao tempo deve mostrar:

- idade do dado;
- limiar esperado;
- última reconciliação;
- fonte consultada;
- impacto da desatualização.

## 10. Critérios de aceitação

- risco não depende apenas de cor;
- bloqueio e erro são visualmente distintos;
- crítico possui confirmação proporcional;
- divergência preserva os dois lados;
- ações destrutivas exibem verbo, objeto e impacto;
- estados desconhecidos não são tratados como falha;
- sucesso só aparece com evidência válida;
- nenhum padrão visual altera a classificação institucional.
