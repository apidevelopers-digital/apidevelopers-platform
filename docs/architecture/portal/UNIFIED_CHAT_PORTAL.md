# Arquitetura Unificada Chat + Portal

**Status:** proposta modular de arquitetura operacional  
**Escopo:** uso conjunto de Chat e Portal por toda a equipe  
**Não altera:** governança, autoridade, gates ou contratos canônicos

## 1. Princípio

A `uni.` opera com duas superfícies complementares:

- **Chat:** ambiente de raciocínio, criação, desenvolvimento, atendimento e preparação;
- **Portal:** ambiente persistente de administração, autorização, execução, evidência e auditoria.

Nenhuma das superfícies substitui a outra.

## 2. Fluxo base

```text
objetivo do usuário
→ conversa no Chat
→ leitura do contexto autorizado
→ preparação de plano, artefato ou operação
→ conferência no Portal
→ validação de escopo, permissão e gate
→ execução pelo serviço responsável
→ evidência posterior
→ atualização do Portal
→ resumo no Chat
```

## 3. Responsabilidades do Chat

O Chat pode:

- receber objetivos em linguagem natural;
- consultar contexto permitido;
- criar documentação e código;
- preparar alterações em Git;
- analisar incidentes;
- montar propostas, campanhas e ativos;
- preparar operações;
- explicar bloqueios;
- resumir evidências.

O Chat não deve:

- armazenar segredos;
- conceder autoridade;
- ignorar gates;
- presumir execução concluída;
- substituir o histórico versionado;
- substituir o Portal como registro operacional persistente.

## 4. Responsabilidades do Portal

O Portal deve:

- administrar clientes, produtos e usuários;
- controlar papéis, escopos e permissões;
- emitir e administrar credenciais;
- apresentar filas e estados operacionais;
- permitir conferência e aprovação;
- chamar integrações autorizadas;
- registrar evidências;
- manter auditoria e histórico;
- isolar tenants e clientes.

## 5. Plataforma única

O objetivo é um único Portal com módulos, não vários sistemas administrativos independentes.

```text
Portal unificado
├── clientes
├── produtos
├── APIs e credenciais
├── desenvolvimento e Git
├── mídia e campanhas
├── financeiro
├── suporte
├── infraestrutura
├── operações
└── auditoria
```

A visibilidade de cada módulo depende do perfil do usuário.

## 6. Visões por perfil

A mesma plataforma pode apresentar:

- visão do proprietário;
- visão do operador;
- visão do desenvolvedor;
- visão do atendimento;
- visão do financeiro;
- visão do cliente.

As visões compartilham infraestrutura, mas não compartilham automaticamente dados, autoridade ou capacidade de execução.

## 7. Critérios de aceitação

- Chat e Portal possuem responsabilidades distintas;
- o Portal é único e modular;
- toda execução real passa por serviço autorizado;
- clientes permanecem isolados;
- credenciais não são expostas em Chat ou Git;
- resultados operacionais exigem evidência;
- ações sensíveis permanecem governadas.
