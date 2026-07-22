# Reancoragem corretiva — Portal e coordenação — 2026-07-21

**Natureza:** correção limitada de continuidade  
**Não altera:** Constituição, identidade institucional ou núcleos canônicos

## 1. Precedência

Esta reancoragem corrige documentos anteriores quando houver conflito sobre:

- quantidade de portais administrativos;
- coordenação entre chats;
- cálculo de percentuais;
- consolidação de branches.

## 2. Regra canônica do Portal

A direção atual é:

> **um Portal unificado, modular, multi-tenant e orientado por capacidades, com visões e experiências diferentes por perfil.**

Perfis podem incluir:

- proprietário;
- operador;
- funcionário;
- desenvolvedor;
- jurídico;
- financeiro;
- cliente;
- parceiro.

Uma visão, módulo, rota ou experiência especializada **não constitui automaticamente outro portal administrativo**.

Um novo portal independente exige decisão explícita de produto, justificativa técnica e aprovação institucional.

## 3. Relação entre as camadas

```text
Chat
→ raciocina, cria, atende e prepara

Portal unificado
→ administra, confere, autoriza, executa e audita

Git/GitHub
→ versiona código, contratos e decisões

Serviços/APIs
→ executam ações reais

Cofre
→ protege segredos e credenciais

Auditoria
→ registra ator, autorização, ação, resultado e evidência
```

## 4. Aprendizado diário

O Portal pode aprender com a produção por meio de:

- memória append-only;
- reflexão consultiva;
- propostas de evolução;
- métricas;
- detecção de repetição e gargalos.

O aprendizado não autoriza:

- mutação automática;
- aprovação automática;
- execução irreversível;
- alteração silenciosa de políticas;
- exposição entre tenants.

Toda evolução material deve ser versionada, testada, auditável e reversível.

## 5. Coordenação entre chats

O Chat Mestre mantém a visão global.

Chats especializados executam frentes delimitadas e não redefinem:

- Constituição;
- nomes institucionais;
- arquitetura transversal;
- percentuais globais;
- regras de segurança.

Quando uma decisão já existir, ela deve ser aplicada, não reapresentada como descoberta.

## 6. Consolidação

Uma capacidade só é considerada institucionalmente disponível quando:

1. possui código ou contrato verificável;
2. tem testes adequados;
3. possui CI verde aplicável;
4. foi incorporada à branch de integração definida;
5. não conflita com documentos canônicos;
6. possui caminho de operação e rollback.

Branches isoladas representam progresso técnico, mas não disponibilidade consolidada.

## 7. Correção de documentos anteriores

Qualquer documento que descreva “portais especializados” deve ser interpretado como:

> módulos, visões ou experiências especializadas dentro do Portal unificado,

salvo quando houver decisão explícita posterior aprovando um produto independente.

## 8. Estado institucional após esta correção

- visão institucional: estável;
- arquitetura geral: coerente;
- Portal: unificado por regra;
- aprendizado: supervisionado;
- chats: especializados e coordenados;
- consolidação: principal gargalo atual;
- produção ampla: ainda não comprovada.

## 9. Próximo passo canônico

Criar e manter a matriz única de consolidação de branches, capacidades, evidências e pendências antes de expandir novas frentes.
