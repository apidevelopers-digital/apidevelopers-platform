# PROTOCOLO CANÔNICO DE CONTINUIDADE ENTRE CONVERSAS

**Status:** ativo  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch de trabalho:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo:** garantir que nenhuma decisão, progresso, bloqueio ou próximo passo dependa do histórico de uma conversa.

## 1. Princípio central

> Conversa é ambiente de trabalho. Git é memória oficial. Portal é governança visual.

Nenhuma informação relevante deve existir apenas em uma janela de conversa.

## 2. Fonte de verdade

A ordem de autoridade é:

1. código, testes e configuração versionados;
2. documentos canônicos do repositório;
3. ADRs e decisões registradas;
4. evidências técnicas de execução;
5. conversa, somente como contexto transitório.

Quando houver conflito, prevalece a evidência versionada mais recente e tecnicamente verificável.

## 3. Início obrigatório de uma nova conversa

Antes de propor ou executar trabalho:

1. confirmar repositório e branch;
2. ler `docs/operating-model/COMPANY_OPERATING_SYSTEM.md`;
3. ler `docs/operating-model/EXECUTIVE_DASHBOARD.md`;
4. ler `docs/operating-model/CURRENT_STATE.md`, quando existir;
5. ler `docs/operating-model/NEXT_ITERATION.md`, quando existir;
6. consultar ADRs relacionados ao assunto;
7. revisar os commits mais recentes da branch;
8. identificar o último marco concluído e o próximo marco permitido.

A conversa não deve reconstruir decisões por memória quando elas já estiverem registradas.

## 4. Encerramento obrigatório de uma sessão de trabalho

Toda sessão que alterar estado relevante deve registrar:

- o que foi identificado;
- o que foi decidido;
- o que foi alterado;
- arquivos e commits envolvidos;
- testes ou evidências;
- bloqueios;
- riscos;
- próximo passo exato;
- ações não executadas.

Sempre que aplicável, atualizar:

- `EXECUTIVE_DASHBOARD.md`;
- `CURRENT_STATE.md`;
- `NEXT_ITERATION.md`;
- ADR correspondente;
- documento de produto, arquitetura ou operação afetado.

## 5. Tipos de registro

### Decisão permanente

Registrar em ADR ou documento canônico.

### Estado atual

Registrar em `CURRENT_STATE.md` e no dashboard.

### Próxima execução

Registrar em `NEXT_ITERATION.md`.

### Risco ou dívida

Registrar em `KNOWN_DEBTS.md` ou documento de risco.

### Capacidade de plataforma

Registrar no Capability Registry.

### Operação repetível

Registrar em runbook.

### Critério de lançamento

Registrar em checklist ou gate de go-live.

## 6. Regra de commit

Cada mudança documental deve:

- ter escopo claro;
- evitar misturar assuntos independentes;
- usar mensagem de commit descritiva;
- apontar o estado real;
- não afirmar aprovação, teste, publicação ou execução sem evidência.

Exemplos:

- `docs(operating-model): atualiza estado da plataforma`
- `docs(product): registra capacidade de billing`
- `docs(adr): decide estratégia de provisionamento`
- `docs(launch): define gate de venda automática`

## 7. Estados permitidos

- rascunho;
- em revisão;
- preparado;
- validado documentalmente;
- implementado;
- testado;
- aprovado;
- publicado;
- revertido;
- bloqueado.

Os estados `implementado`, `testado`, `aprovado` e `publicado` exigem evidência correspondente.

## 8. Ações sensíveis

Merge, deploy, release, publicação, DNS, cobrança, envio real, alteração destrutiva ou operação equivalente não são autorizados por este protocolo.

Essas ações exigem aprovação explícita e o gate específico da ferramenta ou do processo.

## 9. Passagem entre frentes

### Produto e arquitetura

Entrega:

- decisão;
- escopo;
- contratos;
- critérios de aceite;
- dependências;
- riscos;
- prioridade.

### Engenharia

Entrega:

- implementação;
- testes;
- evidências;
- commits;
- limitações;
- impacto técnico.

### Operação

Entrega:

- runbooks;
- status;
- monitoramento;
- incidentes;
- rollback;
- evidências operacionais.

Cada frente deve consumir o registro da anterior e devolver um resultado versionado.

## 10. Integração futura com o Portal

O Portal deve consumir ou refletir os registros versionados para apresentar:

- estado da plataforma;
- gates;
- capacidades;
- produtos;
- roadmap;
- riscos;
- releases;
- clientes;
- operação;
- métricas.

O Portal não deve criar uma segunda fonte de verdade sem sincronização e rastreabilidade.

## 11. Formato mínimo de reancoragem

Toda reancoragem deve conter:

- identidade da plataforma;
- repositório;
- branch;
- estado atual;
- componentes concluídos;
- decisões vigentes;
- commits relevantes;
- bloqueios;
- próxima ação exata;
- restrições de segurança;
- ações não executadas.

## 12. Regra final

> Se uma nova conversa não consegue continuar o trabalho apenas lendo o repositório, o processo de documentação falhou.

O encerramento correto de uma etapa sempre termina com conhecimento versionado, evidência e próximo passo explícito.
