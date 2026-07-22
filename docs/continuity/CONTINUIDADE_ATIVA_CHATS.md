# Continuidade ativa dos chats

**Status:** ponto de entrada operacional vigente  
**Objetivo:** permitir que qualquer chat continue a instituição sem redescobrir decisões, duplicar arquitetura ou inflar percentuais.

## 1. Leitura obrigatória

Antes de propor arquitetura, nomenclatura, percentuais globais ou novas frentes, consultar nesta ordem:

1. documentos constitucionais e canônicos do repositório;
2. `docs/continuity/REANCORAGEM_CORRETIVA_PORTAL_E_COORDENACAO_2026-07-21.md`;
3. `docs/continuity/MAPA_FRENTES_CHATS_2026-07-21.md`;
4. `docs/continuity/AVALIACAO_EVOLUCAO_CHATS_2026-07-21.md`;
5. snapshots técnicos específicos da frente em execução;
6. HEAD, commits, branches, PRs e workflows atuais do GitHub.

Decisões já existentes devem ser aplicadas, não reapresentadas como descoberta.

## 2. Regra vigente do Portal

A direção vigente é:

> um Portal unificado, modular, multi-tenant e orientado por capacidades, com visões e experiências diferentes por perfil.

Uma visão especializada, módulo, rota ou experiência não constitui automaticamente outro portal administrativo.

Documentos antigos que mencionem “portais especializados” devem ser interpretados como módulos, visões ou experiências especializadas dentro do Portal unificado, salvo decisão explícita posterior aprovando produto independente.

## 3. Modelo institucional de trabalho

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

Princípio:

> Automação por padrão; intervenção humana por exceção.

Toda evolução material deve ser versionada, testável, auditável e reversível.

## 4. Frentes permitidas

Estrutura recomendada:

- 1 Chat Mestre;
- até 2 frentes técnicas ativas;
- 1 frente de consolidação e qualidade.

Frentes principais:

1. Chat Mestre — visão, prioridades, decisões e percentuais globais;
2. Engenharia da Plataforma — kernels, Gateway, segurança, dados, workers e CI;
3. Portal unificado — UX, acessibilidade, módulos, telas e integração Chat + Portal;
4. Operações e integrações — clientes, WhatsApp, Meta, VNNOX, mídia, financeiro, site e infraestrutura;
5. Consolidação e qualidade — branches, PRs, CIs, supersessões e documentação canônica.

Uma nova frente só deve abrir quando outra for encerrada, pausada ou incorporada.

## 5. Estado obrigatório de cada chat

Cada chat especializado deve manter:

- objetivo;
- branch base;
- branch de trabalho;
- HEAD inicial e atual;
- entregas;
- testes e CIs;
- bloqueios;
- status de consolidação;
- percentual da própria frente;
- impacto estimado no programa global;
- próximo passo único.

Estados padronizados:

- `planejada`;
- `em execução`;
- `validada isoladamente`;
- `pronta para consolidar`;
- `consolidada`;
- `bloqueada`;
- `supersedida`.

CI verde não significa consolidada. Branch validada não significa capacidade institucional disponível.

## 6. Percentuais vigentes

Percentuais institucionais consolidados na avaliação de 2026-07-21:

| Indicador | Percentual |
|---|---:|
| Definição institucional | 92% |
| Arquitetura e contratos | 88% |
| Implementação técnica acumulada | 52% |
| Integração consolidada na foundation | 34% |
| Prontidão operacional interna | 31% |
| Prontidão comercial reproduzível | 23% |
| Prontidão para produção ampla | 18% |
| Programa institucional completo | 42% |

Chats especializados devem informar separadamente:

- percentual da frente;
- impacto no programa global.

Nenhum chat especializado atualiza sozinho o percentual institucional global sem cruzar integração na foundation, CI global e evidência ponta a ponta.

## 7. Prioridade vigente

A prioridade institucional atual é:

> consolidar branches funcionais maduras na foundation, estabilizar o Platform CI e criar uma matriz única de capacidades, evidências, dependências, supersessões e pendências.

Antes de abrir novas frentes, verificar:

- o que já está incorporado;
- o que permanece isolado;
- o que está duplicado;
- o que foi supersedido;
- o que depende de outra branch;
- o que possui CI especializado, mas ainda não integração global.

## 8. Segurança e autoridade

- não expor segredos em chat, Git, logs ou documentação;
- não executar merge, release, deploy, exclusão ou force update sem aprovação aplicável;
- não alterar silenciosamente Constituição, nomes institucionais ou regras transversais;
- reancoragem nova exige conflito material comprovado;
- correções limitadas devem preservar histórico e indicar precedência.

## 9. Regra para novos chats

Ao iniciar um novo chat:

1. informar que este documento é o ponto de entrada;
2. conferir o HEAD compartilhado atual;
3. verificar branches, PRs e workflows relevantes;
4. ler apenas os snapshots da frente;
5. continuar do próximo objetivo registrado;
6. não repetir uma decisão já canônica.

Este documento coordena a continuidade. Ele não substitui os contratos técnicos nem autoriza merge ou produção.
