# Cognitive Factory Readiness Gate v1

**Status:** draft operacional em validação  
**Autoridade:** Constituição -> instituição -> arquitetura -> plataforma -> operação  
**Escopo:** `apidevelopers-platform` como gate coordenador; `uni-operador`, `uni-code-executor`, `institution-automation` e `apidevelopers-institution` como órgãos externos auditados.  
**Regra:** este gate não autoriza merge, deploy, escrita em produção nem execução sensível.

## Objetivo

Fornecer uma prova auditável de que a instituição cognitiva consegue atravessar, com governança e evidência, o ciclo:

`CognitiveRequest -> Context -> Policy -> Planning -> Decision -> ExecutionPlan -> Approval -> ExecutionRequest -> Executor -> CI -> ExecutionResult -> EvidenceRecord -> ContinuityEvent`.

O gate é deliberadamente fail-closed: ausência de evidência equivale a **PENDENTE**, nunca a aprovado.

## Invariantes

1. O runner institucional é `igor-mac-runner`, com labels `self-hosted`, `macOS`, `X64`.
2. O workflow do gate possui apenas `contents: read`.
3. O gate não faz merge, deploy, publicação, alteração de DNS, escrita em produção nem envio de mensagens.
4. Toda execução sensível permanece condicionada à aprovação explícita exigida pelo mecanismo executor correspondente.
5. Evidências cross-repo devem registrar repositório, branch/ref, SHA e run/artefato verificável.
6. Um componente existente não é considerado pronto apenas por possuir arquivos; precisa de teste e evidência recente.
7. Falhas de dependência, CI, política ou evidência fecham o gate.

## Estágios

### G1 — Platform local

Deve comprovar no `apidevelopers-platform`:

- contratos canônicos presentes;
- kernel vertical executável;
- policy, decision, runtime, evidence e audit disponíveis;
- controlled activation dry-run preservado e sem caminho implícito de execução;
- CI no runner institucional.

**Resultado permitido:** `LOCAL_GATE_PASS`.

### G2 — Operador

Deve anexar evidência verificável de:

- consumo dos contratos oficiais da Platform;
- outbound transport em modo seguro;
- transformação de decisão/plano sem autoaprovação;
- correlação de request/decision/execution/evidence.

### G3 — Executor

Deve anexar evidência verificável de:

- workspace isolado;
- diff antes de escrita;
- política explícita de comandos;
- microcommit em branch de trabalho;
- testes antes de push;
- push apenas para branch de trabalho;
- criação de draft PR;
- nenhum merge automático.

### G4 — Governança

Deve anexar evidência verificável de:

- aprovação explícita quando requerida;
- kill switch;
- idempotência;
- leitura fresca antes da escrita;
- verificação pós-escrita;
- recibo/evidência sanitizada.

### G5 — Fechamento institucional

Deve produzir:

- `ExecutionResult`;
- `EvidenceRecord`;
- `ContinuityEvent`;
- referência verificável no GitHub;
- distinção entre `CONFIRMADO`, `PENDENTE`, `BLOQUEADO` e `INFERIDO`.

## Critério para 100%

A fábrica só pode ser declarada **100% pronta para produção de produtos** quando existir uma execução recente e repetível que:

1. começa em solicitação cognitiva sintética e não destrutiva;
2. atravessa policy, planning e decision;
3. exige/aplica aprovação conforme risco;
4. cria uma alteração inofensiva em branch de trabalho;
5. usa o executor institucional;
6. passa no `igor-mac-runner`;
7. abre draft PR;
8. gera evidência;
9. registra continuidade;
10. prova também um caso negado fail-closed.

Enquanto G2–G5 não tiverem evidência cross-repo recente, o status global do gate permanece **PENDENTE**, mesmo que G1 esteja verde.

## Primeira prova permitida

A primeira prova deve ser não destrutiva e sem produção. Exemplo aceito: criar/atualizar um arquivo de fixture de readiness em branch efêmera, executar testes, fazer push da branch e abrir um draft PR.

O merge desse PR é explicitamente fora do escopo do gate e requer decisão humana separada.
