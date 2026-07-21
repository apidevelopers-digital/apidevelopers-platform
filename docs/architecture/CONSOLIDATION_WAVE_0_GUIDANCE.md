# Orientação de Continuidade — Onda de Consolidação 0

**Status:** orientação operacional canônica  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch de referência:** `foundation/global-platform-bootstrap-20260715`  
**Objetivo:** reduzir risco de dispersão, estabilizar a plataforma e organizar a continuidade em quatro frentes controladas.

## 1. Diagnóstico executivo

A direção arquitetural está correta, mas a execução acumulou muitas frentes na mesma branch antes da consolidação global.

Os principais riscos atuais são:

- CI global ainda não totalmente estabilizada;
- excesso de escopo concentrado em uma única branch;
- evolução simultânea de Kernel, Rule Engine, Portal, CI e jornada comercial;
- integração ponta a ponta ainda não comprovada de forma suficiente;
- commits recentes sem assinatura verificada;
- risco de abrir novas camadas antes de fechar a fundação operacional.

A próxima etapa deve priorizar consolidação, não expansão descontrolada.

## 2. Princípio de operação

Durante esta onda:

- não fazer merge na branch principal;
- não fazer deploy;
- não iniciar novos engines sem justificativa explícita;
- manter Portal somente leitura;
- manter Auto Learning sem poder alterar política canônica;
- registrar todas as mudanças em commits pequenos, independentes e rastreáveis;
- confirmar cada alteração efetivamente criada no GitHub;
- tratar CI global verde como requisito de progressão.

## 3. Quatro frentes permitidas

### Frente 1 — Consolidação da CI e qualidade global

Objetivo: deixar a plataforma integralmente validada.

Prioridades:

1. identificar a causa exata das falhas da `Platform CI`;
2. corrigir workflows, workspaces, dependências e preflights;
3. executar os testes completos da branch;
4. confirmar que workflows específicos e globais passam juntos;
5. registrar evidências de cada execução;
6. impedir que falhas internas sejam reportadas como sucesso.

Critério de conclusão:

- `Platform CI` verde em execução limpa;
- workflows críticos verdes;
- relatório de falhas anteriores e correções aplicadas;
- nenhuma regressão conhecida aberta sem registro.

### Frente 2 — Estabilização do Kernel e Rule Engine

Objetivo: transformar as especificações canônicas em núcleo confiável.

Prioridades:

1. validar contratos, schemas e interfaces;
2. confirmar determinismo dos resultados;
3. validar estados `COMPLIANT`, `CONDITIONAL`, `NON_COMPLIANT`, `INVALID` e `INCOMPLETE`;
4. revisar integridade, hashing e ordenação;
5. testar exceções, timeouts, crashes e relatórios incompletos;
6. garantir filesystem somente leitura para fontes avaliadas;
7. consolidar fixtures e testes de conformidade.

Critério de conclusão:

- contratos versionados;
- testes determinísticos;
- golden fixtures;
- relatório JSON canônico validado;
- comportamento de falha fechado e auditável.

### Frente 3 — Vertical slice comercial e Portal read-only

Objetivo: provar um fluxo real de negócio ponta a ponta sem violar a arquitetura.

Prioridades:

1. consolidar a jornada comercial existente;
2. confirmar entrada, contexto, decisão, evidência e projeção;
3. manter o Portal estritamente read-only;
4. testar limites modulares e ausência de mutação;
5. validar comportamento fail-closed;
6. documentar estados incompletos, erros e recuperação;
7. provar ao menos uma jornada real de ponta a ponta.

Critério de conclusão:

- fluxo demonstrável;
- nenhuma mutação pelo Portal;
- evidência rastreável;
- estados de erro claros;
- testes de integração cobrindo o fluxo principal.

### Frente 4 — Governança, branch strategy e release candidate

Objetivo: preparar a fundação para revisão humana e futura integração.

Prioridades:

1. inventariar todos os pacotes e seus estados;
2. mapear documentos, implementação, testes e pendências;
3. separar novas evoluções em branches menores;
4. definir critérios de branch protection;
5. avaliar assinatura de commits;
6. comparar foundation com `main`;
7. preparar um snapshot canônico de release candidate;
8. produzir checklist de merge sem executar merge.

Critério de conclusão:

- inventário atualizado;
- branch strategy definida;
- riscos e pendências classificados;
- snapshot reproduzível;
- checklist de release candidate aprovado;
- nenhuma ação destrutiva ou merge automático.

## 4. Ordem recomendada

A ordem padrão deve ser:

1. Frente 1 — CI e qualidade global;
2. Frente 2 — Kernel e Rule Engine;
3. Frente 3 — Vertical slice e Portal;
4. Frente 4 — Governança e release candidate.

As quatro frentes podem avançar em paralelo apenas quando não houver dependência bloqueante. A CI global continua sendo o gate principal.

## 5. Regras para os chats paralelos

Cada chat deve:

- declarar claramente qual frente está operando;
- ler o estado atual do repositório antes de alterar;
- não assumir que outro chat concluiu algo sem conferir no GitHub;
- não editar os mesmos arquivos simultaneamente sem coordenação;
- manter commits pequenos;
- registrar commit SHA e arquivos alterados;
- não fazer merge;
- não fazer deploy;
- não alterar política canônica automaticamente;
- parar diante de conflito, divergência ou falha de CI;
- encerrar com status: concluído, pendente, bloqueado ou precisa de aprovação.

## 6. Coordenação entre frentes

Para evitar conflito:

- Frente 1 é dona de workflows, scripts de CI, preflights e correções de execução global.
- Frente 2 é dona do Kernel, Rule Engine, schemas, contratos e testes de conformidade.
- Frente 3 é dona da jornada comercial, integrações da vertical slice e projeções read-only do Portal.
- Frente 4 é dona de inventário, governança, branch strategy, critérios de release e documentação de consolidação.

Arquivos compartilhados só devem ser alterados após conferência do último commit da branch.

## 7. Bloqueios obrigatórios

A progressão deve ser bloqueada quando ocorrer:

- `Platform CI` vermelha;
- divergência entre relatório canônico e resultado exibido;
- mutação pelo Portal;
- alteração automática de política por Auto Learning;
- segredo ou credencial em relatório, log ou commit;
- conflito entre chats;
- arquivo sobrescrito sem conferência;
- tentativa de merge ou deploy sem aprovação explícita;
- falha de integridade ou hash;
- resultado incompleto apresentado como conforme.

## 8. Estado de sucesso da onda

A Onda de Consolidação 0 estará concluída quando:

- a CI global estiver verde;
- Kernel e Rule Engine tiverem testes determinísticos e conformidade;
- uma vertical slice real estiver comprovada;
- o Portal continuar somente leitura;
- governança e branch strategy estiverem documentadas;
- existir um release candidate reproduzível;
- riscos restantes estiverem registrados;
- a decisão de merge puder ser tomada com evidência.

## 9. Próximo passo

O próximo passo recomendado é iniciar pela **Frente 1 — Consolidação da CI e qualidade global**, fazendo diagnóstico preciso da `Platform CI` sem abrir novas funcionalidades.
