# Platform Manifest

**Status:** canônico técnico  
**Plataforma:** API Developers.digital  
**Atualizado em:** 2026-07-21

## Arquitetura modular

A plataforma é organizada por domínios, kernels, serviços e contratos explícitos. Cada módulo deve ter responsabilidade clara, dependências controladas e interfaces versionadas.

Princípios:

- composição antes de acoplamento;
- contratos antes de implementação;
- isolamento entre domínios;
- evolução incremental com compatibilidade;
- evidência técnica para validar cada mudança.

## Multitenancy

O tenant é uma fronteira obrigatória de identidade, dados, autorização, configuração, observabilidade e auditoria.

Nenhum componente pode assumir contexto global quando a operação exigir contexto de tenant. Toda leitura e escrita deve preservar segregação e rastreabilidade.

## APIs e contratos

APIs e eventos devem ser:

- versionados;
- documentados;
- idempotentes quando aplicável;
- portáveis entre provedores;
- protegidos por autenticação e autorização;
- acompanhados por testes de contrato.

Contratos compartilhados pertencem a packages próprios e não devem ser duplicados dentro de aplicações consumidoras.

## Segurança

A segurança segue o princípio de menor privilégio.

Requisitos mínimos:

- identidade verificável de pessoas, serviços e agentes;
- tokens com escopo, validade e revogação;
- segredos fora do código e dos artefatos públicos;
- gates explícitos para ações destrutivas, financeiras ou de publicação;
- trilha de auditoria para decisões e execuções;
- separação entre dry-run, aprovação e execução real.

## Observabilidade

Toda frente operacional relevante deve emitir sinais suficientes para responder:

- o que aconteceu;
- quando aconteceu;
- quem ou qual agente executou;
- em qual tenant, ambiente e versão;
- qual foi o resultado;
- como reproduzir ou reverter.

Logs, métricas, traces, eventos e status operacionais devem usar correlação comum.

## Portabilidade de IA

Modelos de IA são executores intercambiáveis. A plataforma deve expor contexto, autoridade, ferramentas e estado por contratos neutros de fornecedor.

Nenhuma continuidade institucional pode depender da memória privada de um modelo ou de uma conversa específica.

## Precedência

Este manifesto é subordinado ao `INSTITUTIONAL_TECHNOLOGY_MANIFEST.md` e orienta a camada de operação e execução.
