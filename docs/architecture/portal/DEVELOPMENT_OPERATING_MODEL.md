# Modelo de Desenvolvimento Assistido

**Status:** proposta modular de operação  
**Escopo:** relação entre ChatGPT, Git, GitHub, serviços e portais  
**Não altera:** governança, autoridade, gates ou políticas institucionais

## 1. Princípio

ChatGPT e Chats são o ambiente conversacional de desenvolvimento, coordenação e operação assistida.

Git e GitHub são a fonte versionada de código, documentação, histórico, branches, revisões e automações.

Portais são superfícies permanentes de uso e habilitação de produtos, clientes, credenciais e operações.

## 2. Fluxo principal

```text
ChatGPT/Chats
→ planejar
→ desenvolver
→ revisar
→ preparar alteração
→ Git/GitHub
→ build e testes
→ serviços e APIs
→ portais publicados
→ evidência e auditoria
```

## 3. Responsabilidades

| Camada | Responsabilidade |
|---|---|
| ChatGPT | especificar mudánças, gerar código e documentação, revisar e coordenar |
| Git | versionar conteúdo e preservar histórico |
| GitHub | hospedar repositórios, PRs, checks, builds e automações |
| Serviços | executar regras, contratos e ações reais |
| Portais | administrar produtos, clientes, acessos, credenciais e operações |
| Cofre de segredos | armazenar credenciais e segredos fora de chats e repositórios |

## 4. Regras de desenvolvimento

- cada mudánça ocorre em branch própria;
- commits são purposivos e pequenos;
- SHA de commit é confirmado após cada alteração;
- testes e checks antecedem promoção;
- merge, release e deploy exigem autorização aplicável;
- segredos não são esvritos em chats, commits ou arquivos versionados;
- documentação canônica é consultada antes de mudánças materiais.

## 5. Desenvolvimento para novos clientes

Para cada novo cliente:

1. definir escopo e dados isolados;
2. criar projeto ou tenant;
3. configurar permissões;
4. conectar serviços autorizados;
5. gerar superfícies especializadas;
6. executar testes de isolamento;
7. publicar somente após aprovação;
8. monitorar evidências e auditoria.

## 6. Limites

O ChatGPT não substitui:

- repositório de código;
- serviço de produção;
- cofre de segredos;
- banco de dados operacional;
- políticas de autoridade;
- portal de usuário final.

## 7. Critérios de aceitação

- o fluxo ChatGPT → Git → Portal está documentado;
- nenhum segredo é versionado;
- cada mudança possui branch, commit e SHA;
- portais consomem serviços, não regras inventadas na interface;
- merge e publicação permanecem governados;
- novos clientes possuem isolamento explícito.
