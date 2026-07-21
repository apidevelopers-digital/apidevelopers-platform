# Modelo de Desenvolvimento Assistido

**Status:** proposta modular de operação  
**Escopo:** relação entre ChatGPT, Git, GitHub, serviços e Portal unificado  
**Não altera:** governança, autoridade, gates ou políticas institucionais

## 1. Princípio

ChatGPT e Chats são o ambiente conversacional de desenvolvimento, coordenação, atendimento e operação assistida.

Git e GitHub são a fonte versionada de código, documentação, histórico, branches, revisões e automações.

O Portal unificado é a superfície permanente para administrar clientes, produtos, usuários, credenciais, operações, aprovações, evidências e auditoria.

## 2. Fluxo principal

```text
ChatGPT / Chats
→ planejar
→ desenvolver
→ revisar
→ preparar alteração
→ Git / GitHub
→ build e testes
→ serviços e APIs
→ Portal unificado
→ evidência e auditoria
```

## 3. Responsabilidades

| Camada | Responsabilidade |
|---|---|
| ChatGPT | especificar mudanças, gerar código e documentação, revisar e coordenar |
| Git | versionar conteúdo e preservar histórico |
| GitHub | hospedar repositórios, PRs, checks, builds e automações |
| Serviços | executar regras, contratos e ações reais |
| Portal unificado | administrar produtos, clientes, acessos, credenciais e operações por perfil |
| Cofre de segredos | armazenar credenciais e segredos fora de chats e repositórios |

## 4. Regras de desenvolvimento

- cada mudança ocorre em branch própria;
- commits são pequenos e propositivos;
- o SHA é confirmado após cada alteração;
- testes e checks antecedem promoção;
- merge, release e deploy exigem autorização aplicável;
- segredos não são escritos em chats, commits ou arquivos versionados;
- documentos canônicos são consultados antes de mudanças materiais;
- decisões já estabelecidas não são redescritas como arquitetura nova.

## 5. Novos clientes

Para cada novo cliente:

1. definir escopo e dados isolados;
2. criar organização ou tenant;
3. configurar usuários, papéis e permissões;
4. conectar serviços autorizados;
5. habilitar módulos e visões no Portal unificado;
6. desenvolver extensões quando realmente necessárias;
7. executar testes de isolamento;
8. publicar somente após aprovação;
9. monitorar evidências e auditoria.

Um novo cliente não exige automaticamente outro portal administrativo.

## 6. Limites

O ChatGPT não substitui:

- repositório de código;
- serviço de produção;
- cofre de segredos;
- banco de dados operacional;
- políticas de autoridade;
- Portal unificado como registro operacional persistente.

## 7. Critérios de aceitação

- o fluxo ChatGPT → Git → serviços → Portal está documentado;
- nenhum segredo é versionado;
- cada mudança possui branch, commit e SHA;
- o Portal unificado usa visões e permissões, não portais administrativos duplicados;
- merge e publicação permanecem governados;
- novos clientes possuem isolamento explícito;
- decisões canônicas são aplicadas antes de criar nova documentação.
