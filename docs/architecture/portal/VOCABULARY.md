# Vocabulário Operacional do Portal

**Status:** referência modular de linguagem  
**Escopo:** termos permitidos, distinções obrigatórias e usos bloqueados  
**Não altera:** nomenclatura institucional, governança, autoridade ou contratos canônicos

## 1. Identidade

| Conceito | Forma correta |
|---|---|
| Wordmark institucional | `uni.` |
| Operador | `uni. Operador` |
| Plataforma | `API Developers.digital` |
| CLI | `apid` |
| Namespace | `@apidevelopers/*` |

Não usar `uni` sem ponto como marca. Não usar `uni.` como nome do CLI.

## 2. Distinções obrigatórias

### Fonte

Sistema, documento, workflow, commit ou registro de origem consultável.

### Projeção

Representação derivada e temporal produzida para leitura pelo Portal.

### Evidência

Referência verificável que sustenta uma afirmação operacional.

### Estado

Condição exibida para um objeto, gate, ação, fonte ou projeção.

### Gate

Requisito obrigatório que permite ou bloqueia uma transição.

### Autoridade

Papel ou identidade habilitada a tomar uma decisão específica.

### Aprovação

Decisão registrada para escopo, revisão e validade determinados.

### Execução

Ação efetivamente solicitada a uma ferramenta ou sistema.

### Verificação

Conferência posterior que confirma o resultado da execução.

### Reconciliação

Processo explícito de comparar e atualizar projeções derivadas diante de fontes divergentes.

## 3. Sequência operacional

Usar nesta ordem conceitual:

```text
observar
investigar
preparar
simular
conferir
solicitar aprovação
decidir
executar
verificar
reconciliar
```

Uma etapa não implica automaticamente a seguinte.

## 4. Estados recomendados

- saudável;
- atenção;
- bloqueado;
- erro;
- desconhecido;
- divergente;
- desatualizado;
- parcial;
- indisponível;
- sem permissão.

`Saudável` exige evidência válida. `Desconhecido` não equivale a erro.

## 5. Termos de preparação

Usar:

- rascunho;
- preparado;
- dry-run;
- proposta;
- conferência;
- pronto para revisão.

Não usar:

- aplicado;
- concluído;
- publicado;
- aprovado;

quando somente a preparação tiver ocorrido.

## 6. Termos de decisão

Usar:

- aprovação solicitada;
- decisão pendente;
- aprovada;
- rejeitada;
- expirada;
- cancelada;
- consumida;
- alterações solicitadas.

A aprovação deve sempre estar vinculada a revisão, escopo e validade.

## 7. Termos de execução

Usar:

- execução solicitada;
- aceita pela ferramenta;
- em andamento;
- concluída;
- falhou;
- cancelada;
- resultado não verificado;
- resultado verificado;
- estado remoto desconhecido.

`Aceita pela ferramenta` não equivale a `concluída`.

## 8. Termos de evidência

Usar:

- válida;
- ausente;
- expirada;
- conflitante;
- não verificável;
- posterior;
- insuficiente.

Evitar `comprovado` sem referência explícita.

## 9. Termos de temporalidade

Usar:

- instante da fonte;
- instante da projeção;
- idade do dado;
- última reconciliação;
- projeção desatualizada;
- intervalo consultado.

Evitar `agora`, `recentemente` ou `hoje` sem data ou limiar quando a precisão operacional for relevante.

## 10. Termos de falha

Usar:

- falha de rede;
- timeout;
- fonte indisponível;
- autenticação inválida;
- autorização insuficiente;
- payload incompatível;
- reconciliação falhou;
- erro desconhecido.

Evitar:

- algo deu errado;
- erro genérico;
- problema inesperado;

sem categoria, impacto e correlação.

## 11. Termos de ação

Preferir:

- Ver evidência
- Abrir origem
- Atualizar projeção
- Preparar ajuste
- Executar dry-run
- Solicitar aprovação
- Executar aprovado
- Verificar resultado
- Reconciliar
- Cancelar solicitação

Evitar:

- Continuar
- Confirmar
- Processar
- Resolver
- Fazer
- OK

sem objeto explícito.

## 12. Termos bloqueados por segurança

Não exibir ou registrar:

- token;
- senha;
- bearer;
- API Key secreta;
- webhook secret;
- chave privada;
- credencial;
- conteúdo de `.env`;
- payload sensível.

Quando necessário, usar:

- `credencial protegida`;
- `segredo não exibido`;
- `valor sensível omitido`;
- `identificador seguro`.

## 13. Termos institucionais

A interface não deve usar `aprovado`, `publicado`, `deploy realizado`, `release estável`, `GitHub alterado` ou equivalentes sem evidência técnica correspondente.

Preparação documental deve usar:

- proposta;
- rascunho;
- preparado para revisão;
- prévia;
- material de conferência.

## 14. Singular e plural

Preferir termos consistentes:

| Singular | Plural |
|---|---|
| gate | gates |
| projeção | projeções |
| evidência | evidências |
| domínio | domínios |
| workflow | workflows |
| commit | commits |
| snapshot | snapshots |

Não traduzir termos técnicos quando a tradução gerar ambiguidade contratual.

## 15. Critérios de aceitação

- marca e nome operacional seguem o Wordmark;
- preparação não é descrita como execução;
- aprovação não é descrita como publicação;
- aceitação por ferramenta não é descrita como verificação;
- estados desconhecido, erro e divergente permanecem distintos;
- ações usam verbo e objeto;
- termos temporais incluem contexto;
- segredos nunca aparecem no vocabulário visível.
