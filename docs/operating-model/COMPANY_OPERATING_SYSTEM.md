# COMPANY OPERATING SYSTEM

**Projeto:** API Developers.digital  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch de trabalho:** `foundation/global-platform-bootstrap-20260715`  
**Status:** ativo  
**Regra:** nenhuma decisão estratégica deve existir apenas em conversa.

## 1. Objetivo

Este documento define como produto, engenharia, operação e negócio trabalham juntos até o lançamento 100% automático da plataforma.

A plataforma somente será considerada pronta para venda quando toda a jornada funcionar sem intervenção manual:

`visita → cadastro → falidação → checkout → pagamento → provisionamento → uso → medjção → renovação → upgrade/downgrade → suporte → cancelamento`

## 2. Fontes oficiais

As fontes oficiais do projeto são, nesta ordem:

1. código e testes versionados;
2. contratos e Registry;
3. documentos canônicos em `docs/`;
4. decisões registradas em ADR;
5. estado atual e fila da próxima iteração.

Conversas são instrumentos de trabalho, não fonte permanente de verdade.

## 3. Trilhas paralelas

### Engenharia
Responsável por Core, Gateway, Portal, Admin, persistência, billing, observabilidade, segurança, CI e infraestrutura.

### Produto e negócio
Responsável por catálogo comercial, planos, preços, jornada, matriz de automação, regras de provisionamento, suporte e lançamento.

### Operação
Responsável por runbooks, incidentes, auditoria, segurança, monitoramento, backup, SLA e continuidade.

As trilhas podem avançar em paralelo, mas n�o devem editar os mesmos arquivos sem coordenação.

## 4. Documentos obrigatórios

A documentação mínima deve manter:

 - `docs/business/CATALOG_AND_AUTOMATION_MATRIX.md`
 - `docs/business/CUSTOMER_JOURNEY.md`
 - `docs/business/PRICING_AND_PLANS.md`
 - `docs/operating-model/CURRENT_STATE.md`
 - `docs/operating-model/NEXT_ITERATION.md`
 - `docs/operating-model/KNOWN_DEBTS.md`
 - `docs/operations/LAUNCH_CHECKLIST.md`
 - `docs/ADR/`

## 5. Regra de atualização

Ao final de cada lote relevante:

1. confirmar o estado real no repositório;
2. atualizar o documento afetado;
3. executar ou aguardar os testes pertinentes;
4. criar commit descritivo;
5. registrar riscos, bloqueios e próximo passo;
6. não executar merge, release ou deploy sem aprovação explícita.

## 6. Regra de commits

Evitar commits por arquivo.

Preferir um lote coerente por assunto:

- implementação;
- testes;
- documentação;
- workflow necessário.

Não disparar tários pushes em segundos no runner self-hosted.

## 7. Definition of Done comercial

O produto estará pronto para venda automática quando houver:

- site comercial completo;
- catálogo, planos e preços;
- cadastro e verificação de identidade/e-mail;
- autenticação e recuperação de acesso;
- checkout e assinatura;
- provisionamento automático de tenant e projeto;
- API Keys seguras;
- documentação e sandbox;
- medição, limites e excedentes;
- upgrade, downgrade e cancelamento;
- cobrança, renovação e inadimplência;
- notificações;
- suporte;
- painel administrativo;
- logs, auditoria, métricas e alertas;
- staging e produção;
- backup e recuperação;
- termos de uso e privacidade;
- testes ponta a ponta, segurança e carga;
- checklist de lançamento totalmente aprovado.

## 8. Regra de segurança

Nunca versionar segredos, tokens, senhas, chaves privadas ou credenciais reais.

Operações sensíveis devem permanecer protegidas por autorização, auditoria e confirmação explícita.

## 9. Estado operacional

Até nova decisão:

 - branch de trabalho: ativa;
 - PR: draft;
 - merge: não autorizado;
 - deploy: não autorizado;
 - lançamento: bloqueado até o checklist automático estar concluído.

## 10. Próximo passo

Manter duas frentes coordenadas:

- engenharia conclui o Core e a jornada self-service;
- produto transforma capacidades em catálogo, planos e automações implementáveis.
