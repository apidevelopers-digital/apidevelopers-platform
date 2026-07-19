# MATRIZ OFICIAL DE DEPENDÊNCIAS E CONTRATOS — API Developers.digital

**Data da conferência:** 2026-07-18  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Commit-âncora técnico:** `aaa5594217d96efb247501955e4a4493c7324bda`  
**Status:** MATRIZ_OFICIAL_SALVA  
**Escopo:** `packages/`  
**Execução real / deploy:** NÃO EXECUTADOS

## 1. Resultado do inventário

Foram confirmados **16 diretórios** em `packages/`:

- **14 pacotes implementados**, com manifesto e código executável;
- **2 módulos documentais**, sem `package.json`, `src/` ou testes próprios: `auth` e `tenancy`.

A contagem anterior de 17 pacotes estava incorreta. Esta matriz passa a ser a referência oficial para a estrutura verificada no commit-âncora.

## 2. Regra de integração institucional

Os pacotes comunicam-se principalmente por:

1. contratos de dados e identificadores versionados;
2. relatórios/envelopes produzidos por uma etapa e consumidos pela etapa seguinte;
3. testes de integração no repositório;
4. composição pelo runtime e por serviços de guarda.

A ausência de dependência npm direta entre pacotes **não significa ausência de vínculo lógico**. O acoplamento institucional é realizado pelos contratos e validado pela integração.

## 3. Matriz dos 16 diretórios

| Diretório | Estado | Entrada/contrato principal | Saída/contrato principal | Relações institucionais | Evidência |
|---|---|---|---|---|---|
| `auth` | DOCUMENTAL | identidade, autoridade e credenciais não secretas | decisão de autenticação/autorização | futuro vínculo com `tenancy`, `kernel-policy` e `kernel-governance` | somente `README.md`; implementação pendente |
| `contracts` | IMPLEMENTADO | esquemas e IDs canônicos | contratos compartilhados versionados | base transversal para Registry e cadeia governada | manifesto, código e testes |
| `kernel-audit` | IMPLEMENTADO | decisão, plano, política, aprovação, runtime e evidências | relatório de auditoria | recebe da cadeia governada e alimenta `kernel-evolution` | teste de ciclo completo |
| `kernel-constitution` | IMPLEMENTADO | constituição, tenant, ação e proposta | decisão constitucional | antecede `kernel-policy` e condiciona `kernel-governance` | teste constitucional integrado |
| `kernel-decision` | IMPLEMENTADO | relatório de planejamento | registro formal de decisão | recebe de `kernel-planning`; alimenta política e runtime; não executa | teste Planning → Decision |
| `kernel-evidence` | IMPLEMENTADO | registros de evidência | evidência verificável e listagem por tenant | usado por runtime, guarda e auditoria | teste de runtime governado |
| `kernel-evolution` | IMPLEMENTADO | relatório de auditoria | relatório/propostas de evolução | recebe de `kernel-audit`; alimenta `kernel-governance` | teste constitucional integrado |
| `kernel-governance` | IMPLEMENTADO | constituição, política, aprovação, auditoria e evolução | relatório de governança/autorização | consolida o ciclo sem permitir execução direta | teste constitucional integrado |
| `kernel-memory` | IMPLEMEMENTADO | candidatos e registros de menória | memória governada e recuperável | fornece contexto para reasoning; isolamento por tenant permanece requisito transversal | manifesto, código e testes próprios |
| `kernel-planning` | IMPLEMENTADO | achados/reflexão | relatório de planejamento e propostas | recebe da reflexão; alimenta `kernel-decision`; não decide nem executa | teste Planning → Decision |
| `kernel-policy` | IMPLEMENTADO | ação, decisão, plano, aprovação e modo dry-run | decisão de política e hash do plano | antecede runtime/guarda e é auditável | testes de runtime e governança |
| `kernel-reasoning` | IMPLEMENTADO | contexto e evidências | relatório de raciocínio | antecede reflexão/planning no desenho institucional | manifesto, código e testes próprios |
| `kernel-reflection` | IMPLEMENTADO | resultados e achados cognitivos | relatório de reflexão/findings | produz a entrada lógica de `kernel-planning` | manifesto, código e testes próprios |
| `kernel-runtime` | IMPLEMENTADO | decisão, plano, aprovação, confirmação e ações registradas | relatório de runtime e evidências | executa apenas pelo gateway governado; dry-run primeiro | testes de runtime e auditoria |
| `registry` | IMPLEMENTADO | descritores de capacidades e contratos | índice de capacidades/ativos | organiza descoberta e promoção de componentes | manifesto, código, testes e workflow |
| `tenancy` | DOCUMENTAL | identidade opaca de tenant e contexto de isolamento | escopo/limites de tenant | requisito transversal para memória, registry, evidence, runtime e audit | somente `README.md`;  implementação pendente |

## 4. Cadeias comprovadas por integração

### Cadeia de decisão

`reflection/findings → kernel-planning → kernel-decision`

Evidência: teste de integração que preserva imutabilidade e mantém aprovação, mutação e execução automáticas bloqueadas.

### Cadeia de runtime governado

`kernel-planning → kernel-decision → kernel-policy → kernel-runtime → kernel-evidence → kernel-audit`

Evidência: testes de integração com dry-run, hash do plano, aprovação explícita, evidência e auditoria.

### Cadeia constitucional

`kernel-constitution → kernel-policy → kernel-audit → kernel-evolution → kernel-governance`

Evidência: teste integrado em que a Constituição prevalece, a governança pode bloquear promoção e nenhuma etapa executa por conta própria.

## 5. Pontos ainda implícitos

Os vínculos abaixo existem no desenho ou no fluxo de dados, mas ainda precisam de contrato compartilhado formal e/ou teste de integração dedicado:

- `kernel-memory → kernel-reasoning`;
- `kernel-reasoning → kernel-reflection`;
- `kernel-reflection → kernel-planning`;
- `registry → runtime/serviços`;
- `tenancy → todos os componentes com estado`;
- `auth → tenancy/policy/governance`;
- adoção uniforme de `@apidevelopers/contracts` por todos os pacotes.

## 6. Lacunas oficiais

1. `auth` ainda não é pacote executável.
2. `tenancy` ainda não é pacote executável.
3. Parte dos contratos continua estruturalmente implícita nos objetos usados pelos testes.
4. Nem todos os pacotes possuem CI dedicado.
5. A integração completa deve migrar de imports relativos de teste para contratos públicos estáveis.
6. A promoção para `main` permanece fora do escopo desta matriz.

## 7. Impacto na prontidão

Com a auditoria institucional integrada, o Platform CI verde no commit-âncora e a cadeia central comprovada, a prontidão institucional fica registrada em **77%**.

A matriz reduz a incerteza documental, mas não eleva a plataforma a 80% sozinha porque `auth`, `tenancy`, proteção de branch, promoção formal e observabilidade consolidada continuam pendentes.

## 8. Governança

- **status:** MATRIZ_OFICIAL_SALVA
- **versão_origem:** GitHub no commit `aaa5594217d96efb247501955e4a4493c7324bda`
- **alvo:** API Developers.digital
- **risco:** R2
- **decisão_milena:** NÃO INFORMADA
- **execução_igor:** DOCUMENTAÇÃO TÉCNICA SALVA
- **deploy:** NÃO EXECUTADO
- **evidência_técnica:** 16 diretórios conferidos; 14 implementados; `auth` e `tenancy` documentais; testes de integração centrais presentes
- **próximo_estado_permitido:** transformar os pontos implícitos em contratos públicos/testes e decidir a implementação de `auth` e `tenancy`
