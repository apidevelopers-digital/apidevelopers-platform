# REANCORAGEM CANÔNICA — CONTINUIDADE API DEVELOPERS.DIGITAL — 2026-07-20

**Data:** 2026-07-20  
**Status:** PREPARADO_PARA_CONTINUIDADE  
**Finalidade:** permitir que uma nova conversa continue o desenvolvimento técnico sem redescobrir decisões, branches, gates, pacotes, estado comercial e método de trabalho paralelo.

## 1. Identidade e nomenclatura

- Plataforma: **API Developers.digital**
- Organização/Wordmark: `uni.`
- Nome operacional: `uni. Operador`
- CLI oficial: `apid`
- Namespace de pacotes: `@apidevelopers/*`
- `uni.` não deve nomear o CLI, o Kernel ou o Engineering Toolkit.
- A grafia institucional deve permanecer em minúsculo e com ponto final: `uni.`.

## 2. Repositório e branch

- Repositório: `sitedauni/apidevelopers-platform`
- Branch compartilhada de trabalho: `foundation/global-platform-bootstrap-20260715`
- HEAD técnico confirmado antes deste documento: `a2bbe6c5dc3c13e9126b2b5a01bec9c0b0127761`
- Commit do HEAD técnico: `test(provisioning-core): cobre fluxo, compensação e retry`
- Pull request existente: `#1`
- Base do PR: `main`
- `main` permanece com referência legada em `e5aef84f36d00dfae694911f44be9f7f6edcaf79`.

### Regra obrigatória

O commit que adiciona este documento será posterior ao HEAD técnico acima. Ao iniciar outra conversa, consultar novamente o HEAD da branch compartilhada antes de escrever, testar ou promover qualquer lote.

## 3. Estado dos gates do HEAD técnico

### Provisioning Core CI

- Run: `29782567462`
- HEAD: `a2bbe6c5dc3c13e9126b2b5a01bec9c0b0127761`
- Status: `completed`
- Conclusão: `success`

### Public Exposure Audit CI

- Run: `29782567448`
- HEAD: `a2bbe6c5dc3c13e9126b2b5a01bec9c0b0127761`
- Status: `completed`
- Conclusão: `success`

### Gates imediatamente anteriores

- Checkout Core CI: `29780384625` — `success`
- Checkout Public Exposure Audit: `29780384408` — `success`
- Billing Core CI: `29778200521` — `success`
- Billing Public Exposure Audit: `29778200563` — `success`

## 4. Cadeia comercial técnica concluída

A cadeia implementada e versionada cobre:

```text
produto
  → plano
  → checkout
  → confirmação de pagamento
  → assinatura
  → direitos
  → provisionamento
  → tenant
  → projeto
  → API Key
  → consumo
  → limites
  → faturamento
  → pagamento registrado
  → persistência
```

Pacotes centrais presentes:

- `registry-core`
- `platform-core`
- `auth-core`
- `apikey-core`
- `tenant-core`
- `user-core`
- `project-core`
- `usage-core`
- `limits-core`
- `plan-core`
- `entitlement-core`
- `persistence-core`
- `subscription-core`
- `billing-core`
- `checkout-core`
- `provisioning-core`

O repositório também contém a família `kernel-*`, incluindo memória, reasoning, planning, decision, reflection, audit, governance, constitution, evolution, evidence, policy e runtime.

## 5. Pacotes concluídos nesta etapa da conversa

### `@apidevelopers/persistence-core`

Responsabilidades principais:

- documentos JSON duráveis;
- checksum SHA-256;
- envelope versionado;
- validação estrutural;
- escrita atômica;
- lock entre processos;
- revisão otimista;
- transação com rollback;
- idempotência;
- outbox transacional;
- repositório assíncrono;
- isolamento de resultados.

Gate concluído antes dos domínios comerciais posteriores.

### `@apidevelopers/subscription-core`

Responsabilidades principais:

- snapshots imutáveis de assinatura;
- ciclo `pending`, `active`, `past_due`, `suspended`, `cancelled`, `expired`;
- renovação, suspensão, recuperação e cancelamento;
- mudança de plano;
- idempotência de eventos;
- eventos de domínio.

### `@apidevelopers/billing-core`

Responsabilidades principais:

- faturas `draft`, `open`, `paid`, `past_due`, `void`, `uncollectible`;
- recorrência;
- excedentes medidos;
- créditos e ajustes;
- pagamentos parciais e totais;
- histórico append-only;
- revisões sequenciais;
- eventos para cobrança e assinatura;
- nenhuma credencial ou token de pagamento armazenado.

Validação local registrada: `9/9`.

### `@apidevelopers/checkout-core`

Responsabilidades principais:

- intenção de compra idempotente;
- sessão hospedada por provedor externo;
- produto, plano, preço e moeda congelados;
- estados `pending`, `completed`, `expired`, `cancelled`;
- deduplicação de criação e webhook;
- confirmação com sessão, valor e moeda compatíveis;
- bloqueio de cartão, CVV, token, senha, segredo e autorização em metadados;
- evento canônico para ativação posterior.

Validação local registrada: `9/9`.

### `@apidevelopers/provisioning-core`

Responsabilidades principais:

- consumir somente assinatura `active`;
- solicitação idempotente por assinatura;
- estados `requested`, `running`, `completed`, `failed`, `cancelled`;
- sequência tenant → projeto → API Key;
- registro somente de `id` e `prefix` da API Key, nunca o segredo;
- tentativas e retry auditáveis;
- compensação em ordem reversa;
- bloqueio de nova tentativa enquanto compensações estiverem pendentes;
- snapshots imutáveis e histórico append-only;
- eventos de onboarding e operação;
- bloqueio de dados sensíveis em metadados.

Validação local registrada: `10/10`.

## 6. Incidente operacional resolvido

Durante a publicação de `provisioning-core`, um blob de `service-context.mjs` divergiu da versão local validada.

Conduta aplicada:

1. promoção bloqueada;
2. conteúdo remoto corrigido;
3. SHA esperado restaurado;
4. pacote segmentado em arquivos menores;
5. testes repetidos;
6. promoção realizada somente após integridade;
7. CI e auditoria pública concluídos com sucesso.

Regra permanente:

> Nunca promover um lote quando qualquer blob remoto divergir da versão local validada.

## 7. Método obrigatório para trabalho paralelo

Existe outra conversa/janela atuando no mesmo repositório e na mesma branch.

Fluxo obrigatório:

1. consultar HEAD da branch compartilhada;
2. consultar commits recentes;
3. escolher frente complementar;
4. criar branch temporária a partir do HEAD mais recente;
5. implementar e testar localmente;
6. publicar na branch temporária;
7. conferir blobs e SHAs;
8. reconsultar HEAD compartilhado;
9. se o HEAD avançou, criar nova branch reancorada e reaplicar somente os arquivos próprios;
10. promover apenas por fast-forward com `force: false`;
11. acompanhar todos os workflows disparados;
12. não iniciar novo lote enquanto os gates relevantes estiverem indefinidos.

### Proibições

- não usar force push;
- não sobrescrever trabalho paralelo;
- não competir pelos mesmos arquivos sem necessidade;
- não fazer merge sem aprovação explícita;
- não criar release sem aprovação explícita;
- não executar deploy sem aprovação explícita;
- não cancelar workflows manualmente;
- não afirmar CI verde sem verificar o run;
- não expor tokens, senhas, API keys, bearer ou credenciais.

## 8. Estratégia comercial

A plataforma não será lançada como piloto manual.

A jornada-alvo continua sendo:

```text
visita
  → entendimento do produto
  → escolha do plano
  → conta
  → pagamento
  → assinatura
  → provisionamento
  → tenant
  → projeto
  → API Key
  → documentação
  → primeiro teste
  → consumo
  → limites
  → cobrança
  → suporte
  → cancelamento ou reativação
```

Estimativa operacional atual para venda automática completa:

- progresso central estimado: **64%**
- margem prudente: **61%–67%**

Essa estimativa não significa produção pronta. Ela mede cobertura arquitetural e funcional central.

## 9. Maiores blocos ainda pendentes

1. camada de ativação que una checkout confirmado, assinatura e provisionamento;
2. adaptador real de provedor de pagamento e validação criptográfica de webhook;
3. persistência SQL e adaptadores de produção multi-réplica;
4. integração Gateway → entitlement → usage → limits;
5. onboarding automático no Portal;
6. documentação e teste inicial da API pelo cliente;
7. cobrança real de excedentes;
8. suspensão, recuperação e reativação automáticas;
9. observabilidade, tracing, alertas e operação de produção;
10. segurança de produção, rotação e gestão de segredos;
11. suporte, cancelamento e reativação self-service;
12. validação jurídica, comercial e fiscal da jornada.

## 10. Próxima ação técnica recomendada

Criar uma camada de ativação idempotente, preferencialmente como pacote `@apidevelopers/activation-core`, após verificar que nenhuma frente paralela já iniciou componente equivalente.

Responsabilidades propostas:

- consumir `checkout.session.completed`;
- validar `confirmed: true`;
- criar ou localizar assinatura idempotentemente;
- ativar a assinatura;
- solicitar provisionamento;
- acompanhar conclusão ou falha;
- emitir `activation.requested`, `activation.completed` e `activation.failed`;
- manter correlação entre checkout, pagamento, assinatura e provisionamento;
- não executar chamadas de provedor diretamente;
- não armazenar segredo;
- produzir plano de compensação para falhas parciais;
- permitir retry seguro;
- integrar posteriormente com onboarding e Portal.

### Ordem de implementação

1. conferir HEAD e commits recentes;
2. inspecionar contratos públicos de checkout, subscription e provisioning;
3. criar branch temporária;
4. criar manifesto;
5. criar modelo e repositório append-only;
6. criar orquestração idempotente;
7. criar testes de sucesso, duplicidade, falha e retry;
8. criar README e workflow;
9. validar localmente;
10. reconsultar HEAD;
11. promover somente por fast-forward;
12. acompanhar CI e Public Exposure Audit.

## 11. Próximas etapas após activation-core

1. `onboarding-core` ou módulo equivalente;
2. provider adapter de checkout/pagamento;
3. adaptadores SQL;
4. integração de enforcement no Gateway;
5. Portal self-service;
6. automação operacional e observabilidade;
7. preparação de staging;
8. somente depois, com aprovação explícita, release e deploy.

## 12. Documentos canônicos de governança

Prioridade:

1. `uni_nucleo_v0_2_6_documento_canonico_para_gpt.md`
2. documentos de arquitetura e governança versionados no repositório;
3. esta reancoragem de 2026-07-20;
4. reancoragem de 2026-07-16 apenas como histórico.

Regras essenciais:

- Wordmark correto: `uni.`
- Nome operacional: `uni. Operador`
- Milena decide.
- Igor aplica tecnicamente quando autorizado.
- `uni.` prepara.
- Sem evidência, não confirmar execução.
- R5 bloqueia.
- Segredos não são repetidos, armazenados ou registrados.
- GitHub alterado só pode ser confirmado com evidência técnica.

## 13. Prompt para abrir a nova conversa

> Continue o desenvolvimento técnico do repositório `sitedauni/apidevelopers-platform` na branch `foundation/global-platform-bootstrap-20260715`. Leia primeiro `docs/REANCORAGEM_CONTINUIDADE_API_DEVELOPERS_2026-07-20.md` e reconsulte o HEAD atual, porque há outra conversa trabalhando em paralelo. O HEAD técnico registrado antes do documento é `a2bbe6c5dc3c13e9126b2b5a01bec9c0b0127761`, com `provisioning-core` e Public Exposure Audit verdes. A cadeia produto → plano → checkout → assinatura → provisionamento → tenant → projeto → API Key → consumo → limites → billing está implementada em pacotes. A próxima frente recomendada é uma camada idempotente `activation-core` ligando checkout confirmado, assinatura e provisionamento. Trabalhe em branch temporária, teste localmente, confira blobs/SHA, reconsulte o HEAD e promova apenas por fast-forward sem força. Não faça merge, release ou deploy sem aprovação explícita.

## 14. Estado operacional

- status: `PREPARADO_PARA_CONTINUIDADE`
- versão_origem: `CONVERSA_TECNICA_2026-07-20`
- alvo: `NOVA_CONVERSA_API_DEVELOPERS`
- risco: `R2`
- decisão_milena: `PENDENTE`
- execução_igor: `DOCUMENTO_VERSIONADO_NA_BRANCH_AUTORIZADA`
- deploy: `NÃO_EXECUTADO`
- evidência_técnica: `HEAD, commits e runs do GitHub conferidos`
- próximo_estado_permitido: `INICIAR_ACTIVATION_CORE_EM_BRANCH_TEMPORARIA_APOS_RECONSULTAR_HEAD`
