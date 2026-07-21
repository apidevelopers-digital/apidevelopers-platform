# Entrega de Soluções para Clientes

**Status:** proposta modular de operação  
**Escopo:** desenvolvimento, onboarding e operação de soluções para novos clientes  
**Não altera:** contratos comerciais, autoridade ou políticas institucionais

## 1. Princípio

A equipe desenvolve pelo Chat e Git, administra pelo Portal e entrega ao cliente uma visão restrita da mesma plataforma quando necessário.

Não é obrigatório criar um sistema administrativo separado para cada cliente.

## 2. Ciclo de entrega

```text
oportunidade
→ diagnóstico
→ proposta
→ cadastro do cliente
→ tenant
→ produto ou serviço
→ integrações
→ credenciais
→ desenvolvimento
→ testes
→ onboarding
→ publicação
→ operação
→ suporte e evolução
```

## 3. Cadastro do cliente

O Portal deve registrar:

- identidade da organização;
- contatos;
- responsáveis;
- produtos contratados;
- ambientes;
- usuários;
- papéis;
- integrações;
- limites;
- dados financeiros permitidos;
- histórico de decisões.

## 4. Tenant

Cada cliente deve possuir isolamento lógico explícito.

O tenant controla:

- dados visíveis;
- usuários;
- aplicações;
- credenciais;
- campanhas;
- arquivos;
- operações;
- auditoria;
- limites de consumo.

## 5. Desenvolvimento

Para cada solução:

1. definir requisitos;
2. registrar escopo;
3. criar branch ou repositório;
4. desenvolver e testar;
5. preparar configuração não sensível;
6. cadastrar segredos no cofre;
7. criar aplicação e ambiente;
8. publicar após aprovação;
9. verificar funcionamento;
10. registrar evidências.

## 6. Portal do cliente

A visão do cliente pode incluir:

- serviços contratados;
- usuários;
- aplicações;
- tokens permitidos;
- campanhas;
- relatórios;
- aprovações;
- cobranças;
- chamados;
- documentação.

O cliente nunca vê dados de outro tenant ou infraestrutura interna não autorizada.

## 7. Tokens e APIs

A emissão deve seguir:

```text
cliente
→ projeto
→ aplicação
→ ambiente
→ escopos
→ validade
→ aprovação quando necessária
→ geração segura
→ exibição única
→ auditoria
```

## 8. Suporte

O atendimento deve registrar:

- solicitação;
- prioridade;
- impacto;
- evidências;
- ações realizadas;
- responsável;
- comunicação com o cliente;
- conclusão;
- prevenção de recorrência.

## 9. Evolução

Melhorias reutilizáveis podem retornar para a plataforma comum, desde que:

- não incluam dados do cliente;
- respeitem propriedade intelectual;
- sejam generalizadas;
- sejam revisadas;
- sejam versionadas;
- não ampliem autoridade implicitamente.

## 10. Critérios de aceitação

- cada cliente possui tenant isolado;
- desenvolvimento é versionado;
- segredos permanecem fora do Git e Chat;
- publicação exige teste e aprovação aplicável;
- o cliente vê apenas o próprio escopo;
- tokens possuem ciclo seguro;
- suporte e evolução são auditáveis.
