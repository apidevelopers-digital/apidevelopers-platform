# Comando Canônico da Torre de Controle — Reancoragem e Continuidade

**Status:** ativo  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch de referência:** `foundation/global-platform-bootstrap-20260715`  
**Modo operacional:** consolidação controlada  
**Autoridade de coordenação:** Torre de Controle  
**Execução autorizada:** chat executor ao lado  
**Demais chats:** pausados até nova liberação

## 1. Objetivo

Centralizar a condução da consolidação da plataforma, impedir sobreposição entre chats, preservar rastreabilidade e transformar a branch atual em uma base revisável, testável, auditável e apta a evoluir com padrão institucional.

Esta fase não é de expansão funcional. É de diagnóstico, estabilização, prova e preparação de release candidate.

## 2. Papéis

### Torre de Controle

Responsável por:

- definir prioridade e ordem de execução;
- validar estado real do repositório antes de cada comando;
- impedir duplicidade de trabalho;
- revisar evidências, SHAs, workflows e riscos;
- autorizar ou bloquear mudanças sensíveis;
- manter o quadro consolidado;
- decidir quando uma frente pode avançar;
- bloquear merge e deploy até existir evidência suficiente.

### Chat Executor

Responsável por:

- executar somente o comando vigente da Torre de Controle;
- trabalhar em escopo pequeno e declarado;
- produzir microcommits;
- rodar os testes pertinentes;
- registrar evidências;
- parar diante de conflito, ambiguidade ou falha de CI;
- não abrir novas frentes por iniciativa própria.

### Demais Chats

Permanecem pausados. Só podem voltar quando receberem:

- frente definida;
- escopo de arquivos;
- critério de conclusão;
- restrições;
- dependências;
- autorização explícita da Torre de Controle.

## 3. Regras obrigatórias de microcommit

Cada alteração deve obedecer ao fluxo:

```text
1 problema
→ 1 hipótese
→ 1 ajuste pequeno
→ 1 conjunto mínimo de arquivos
→ 1 teste correspondente
→ 1 microcommit
→ 1 evidência
```

Um microcommit deve:

- tratar um único objetivo lógico;
- evitar misturar funcionalidade, refatoração e documentação;
- incluir teste quando aplicável;
- ter mensagem objetiva;
- ser fácil de revisar;
- ser fácil de reverter;
- não esconder efeitos colaterais;
- registrar o SHA ao final.

Padrões recomendados:

```text
fix(scope): descrição objetiva
test(scope): cobertura objetiva
docs(scope): documentação objetiva
chore(scope): manutenção objetiva
refactor(scope): refatoração sem mudança funcional
```

Não usar mensagens vagas como `update`, `improve`, `changes` ou `fix things`.

## 4. Regras de segurança e governança

Durante esta onda:

- não fazer merge em `main`;
- não fazer deploy;
- não criar nova funcionalidade;
- não iniciar novo engine ou novo módulo;
- não alterar política canônica automaticamente;
- não permitir mutação pelo Portal;
- não resolver conflito sem diagnóstico;
- não sobrescrever arquivos sem conferir o HEAD;
- não apresentar execução parcial como concluída;
- não continuar com CI global vermelha;
- não expor segredos em commits, logs ou relatórios.

Qualquer ação destrutiva, merge, deploy, alteração de política ou mudança de infraestrutura exige aprovação explícita.

## 5. Ordem oficial da consolidação

### Etapa A — Diagnóstico somente leitura

Produzir:

1. comparação entre `main` e a branch foundation;
2. causa do estado `dirty` do PR;
3. lista dos workflows obrigatórios;
4. estado dos workflows no HEAD atual;
5. inventário de pacotes e módulos;
6. arquivos com maior concentração de alterações;
7. sobreposições e conflitos prováveis;
8. riscos para integração;
9. proposta de divisão em unidades revisáveis;
10. critérios objetivos para release candidate.

Nesta etapa, não alterar arquivos.

### Etapa B — Estabilização da CI

Após aprovação do diagnóstico:

- tratar uma falha por vez;
- usar microcommits;
- executar testes específicos antes da suíte global;
- comprovar o resultado no GitHub;
- parar diante de regressão não relacionada.

### Etapa C — Validação modular

Validar, no mínimo:

- Kernel;
- Rule Engine;
- contratos e schemas;
- Portal somente leitura;
- vertical slice comercial;
- segurança e exposição pública;
- determinismo e integridade das evidências.

### Etapa D — Governança de integração

Preparar:

- inventário final;
- mapa de dependências;
- riscos remanescentes;
- estratégia de branches futuras;
- branch protection;
- CODEOWNERS;
- política de revisão;
- política de commits assinados;
- checklist de release candidate;
- comparação final com `main`.

### Etapa E — Decisão

A Torre de Controle classifica o estado como:

- `PRONTO PARA REVISÃO`;
- `PENDENTE`;
- `BLOQUEADO`;
- `PRECISA DE APROVAÇÃO`.

Merge e deploy continuam fora de escopo até decisão humana explícita.

## 6. Critérios de release candidate

Um release candidate só pode ser proposto quando:

- Platform CI estiver verde no HEAD;
- workflows críticos estiverem verdes;
- nenhuma falha conhecida estiver mascarada;
- Kernel e Rule Engine tiverem testes determinísticos;
- contratos estiverem versionados;
- Portal permanecer somente leitura;
- uma vertical slice real estiver comprovada;
- inventário estiver atualizado;
- riscos estiverem registrados;
- rollback estiver definido;
- o snapshot for reproduzível;
- o PR estiver revisável;
- conflitos com `main` estiverem diagnosticados e tratados.

## 7. Formato obrigatório de entrega do Chat Executor

Cada ciclo deve terminar com:

```text
STATUS:
OBJETIVO:
ESCOPO:
ARQUIVOS ALTERADOS:
TESTES EXECUTADOS:
RESULTADO:
COMMIT SHA:
WORKFLOW:
RISCOS:
PENDÊNCIAS:
PRÓXIMO PASSO RECOMENDADO:
```

Quando não houver alteração:

```text
STATUS: DIAGNÓSTICO CONCLUÍDO
ALTERAÇÕES: NENHUMA
EVIDÊNCIAS:
BLOQUEIOS:
RECOMENDAÇÃO:
```

## 8. Comando vigente para o Chat Executor

```text
Entrar em modo de consolidação estrita.

Não criar funcionalidades novas.
Não fazer merge.
Não fazer deploy.
Não alterar arquivos nesta primeira etapa.

Produzir um diagnóstico somente leitura contendo:

1. diferença entre main e foundation;
2. causa do estado dirty do PR #1;
3. workflows obrigatórios e seus estados no HEAD atual;
4. inventário dos pacotes e módulos;
5. arquivos com maior concentração de alterações;
6. conflitos e sobreposições prováveis;
7. riscos para merge;
8. proposta de divisão da mega-branch em unidades revisáveis;
9. critérios objetivos para release candidate;
10. evidências com SHAs, nomes de workflows e resultados.

Parar e reportar caso encontre divergência, conflito, falha de CI, segredo, ação destrutiva ou necessidade de aprovação.
```

## 9. Condição para reabrir os demais chats

Os demais chats só serão reativados quando:

- o diagnóstico estiver concluído;
- os domínios de arquivos estiverem separados;
- não houver sobreposição;
- cada frente tiver critério de conclusão;
- a Torre de Controle emitir comandos independentes;
- a CI global estiver suficientemente estável para paralelismo seguro.

## 10. Estado operacional

```text
TORRE DE CONTROLE: ATIVA
CHAT EXECUTOR: AUTORIZADO SOB COMANDO
OUTROS CHATS: PAUSADOS
EXPANSÃO: BLOQUEADA
MERGE: BLOQUEADO
DEPLOY: BLOQUEADO
MODO: CONSOLIDAÇÃO INSTITUCIONAL
```
