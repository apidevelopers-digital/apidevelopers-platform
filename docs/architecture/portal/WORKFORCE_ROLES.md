# Papéis da Equipe no Modelo Chat + Portal

**Status:** proposta modular de operação  
**Escopo:** organização de uma equipe pequena com alta alavancagem  
**Não altera:** contratos trabalhistas, autoridade institucional ou políticas de acesso

## 1. Princípio

Todos os funcionários usam Chat e Portal.

O Chat amplia capacidade de análise e produção.  
O Portal limita, registra e audita o que cada pessoa pode administrar ou executar.

## 2. Papéis iniciais

| Papel | Responsabilidade principal |
|---|---|
| Proprietário | estratégia, vendas, decisões sensíveis e visão total |
| Operador de clientes | atendimento, onboarding, campanhas, financeiro e rotina comercial |
| Operador técnico | APIs, integrações, Git, sites, builds e infraestrutura |

Uma mesma pessoa pode acumular papéis, mas as permissões continuam separadas.

## 3. Capacidades por papel

### Proprietário

Pode, conforme política:

- criar e desativar usuários;
- definir papéis;
- aprovar operações críticas;
- acessar visão consolidada;
- administrar clientes e produtos;
- revisar auditoria;
- definir limites financeiros e operacionais.

### Operador de clientes

Pode, conforme escopo:

- criar cadastros e onboarding;
- atender clientes;
- preparar campanhas e conteúdos;
- acompanhar contratos e recebíveis;
- abrir solicitações técnicas;
- emitir relatórios;
- solicitar aprovações.

### Operador técnico

Pode, conforme escopo:

- criar branches e commits;
- preparar integrações;
- administrar aplicações;
- configurar ambientes;
- criar ou rotacionar credenciais autorizadas;
- investigar builds e infraestrutura;
- executar dry-runs;
- solicitar aprovação para produção.

## 4. Matriz de capacidade

As permissões devem ser separadas em:

- consultar;
- criar;
- editar;
- preparar;
- aprovar;
- executar;
- verificar;
- administrar usuários;
- administrar credenciais;
- acessar dados financeiros;
- acessar infraestrutura.

Acesso ao Portal não concede todas as capacidades.

## 5. Trabalho assistido

Cada funcionário deve poder:

1. informar o objetivo no Chat;
2. receber plano e contexto;
3. preparar artefatos ou ações;
4. abrir a conferência no Portal;
5. solicitar decisão quando necessário;
6. executar somente o permitido;
7. verificar o resultado;
8. registrar conclusão ou pendência.

## 6. Escalonamento

O sistema deve encaminhar para outro papel quando houver:

- falta de permissão;
- risco acima do limite;
- impacto financeiro;
- alteração em produção;
- exposição pública;
- revogação de acesso;
- mudança de tenant;
- operação irreversível.

## 7. Continuidade

O trabalho não pode depender exclusivamente da memória individual.

Devem permanecer registrados:

- contexto;
- cliente;
- tarefa;
- decisão;
- branch ou artefato;
- operação preparada;
- aprovação;
- evidência;
- próximo passo.

## 8. Critérios de aceitação

- todos usam Chat e Portal;
- permissões são concedidas por capacidade;
- acúmulo de função não remove gates;
- tarefas possuem contexto persistente;
- operações sensíveis podem ser escaladas;
- clientes e tenants permanecem isolados;
- auditoria identifica ator, ação e resultado.
