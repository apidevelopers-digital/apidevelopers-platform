# Sistema Multiagente Institucional — V1

Status: arquitetura canônica inicial  
Instituição: API Developers Digital  
Branch: `feature/institutional-multi-agent-core-20260721`

## Propósito

Transformar objetivos humanos em missões governadas, decompor trabalho cognitivo em tarefas, instanciar agentes especializados, administrar recursos computacionais, verificar resultados de forma independente, consolidar entregas e registrar memória e aprendizagem.

O sistema opera subordinado à Constituição, às políticas institucionais, aos domínios de autoridade e às aprovações humanas aplicáveis.

## Princípios

1. Autoridade humana final.
2. Negação por padrão para ações sensíveis.
3. Separação entre produção e verificação.
4. Evidência antes de conclusão.
5. Agentes são papéis; modelos são recursos substituíveis.
6. Toda missão possui objetivo, critérios de sucesso, risco e orçamento.
7. Nenhum agente recebe autoridade implícita.
8. Execuções relevantes devem ser rastreáveis, auditáveis e reversíveis quando possível.
9. Memória institucional exige finalidade, classificação, retenção e autorização.
10. Recursos computacionais são patrimônio institucional limitado.

## Arquitetura

```text
Autoridade humana
  -> Constituição e políticas
  -> Plano de Controle Cognitivo
       -> Mission Director
       -> Mission Registry
       -> Agent Registry
       -> Resource Governor
       -> Governance Gate
  -> Grafo da missão
       -> Célula A: compreender e planejar
       -> Célula B: construir e operar
       -> Célula C: verificar e contestar
  -> Motor de Consolidação
  -> Execution Gateway
  -> Evidência, memória, aprendizagem e observabilidade
```

## Células de missão

### Célula A — Compreensão e Estratégia

Converte intenção humana em missão governável.

Papéis disponíveis:
- analista de intenção;
- pesquisador;
- analista de contexto;
- arquiteto institucional;
- arquiteto técnico;
- analista de requisitos;
- planejador;
- analista de riscos;
- estimador de recursos;
- crítico estratégico.

### Célula B — Construção e Operação

Produz artefatos verificáveis.

Papéis disponíveis:
- programador assistido;
- engenheiro backend;
- engenheiro frontend;
- especialista de banco;
- especialista de APIs;
- especialista de automação;
- especialista de infraestrutura;
- engenheiro de testes;
- documentador técnico;
- operador de implantação.

### Célula C — Verificação e Contradição

Valida de forma independente o trabalho produzido.

Papéis disponíveis:
- revisor factual;
- revisor lógico;
- revisor de código;
- revisor de segurança;
- revisor arquitetural;
- revisor constitucional;
- auditor de permissões;
- validador de testes;
- red team adversarial;
- auditor de evidências.

## Fluxo de missão

1. Registrar objetivo, solicitante e domínio de autoridade.
2. Classificar risco e orçamento.
3. Construir o grafo de tarefas.
4. Selecionar papéis e recursos.
5. Executar tarefas cognitivas e operacionais dentro dos limites.
6. Verificar resultados de forma independente.
7. Corrigir ou rejeitar falhas.
8. Consolidar a entrega.
9. Solicitar aprovação quando exigida.
10. Executar, conferir e registrar evidências.
11. Produzir memória e registro pedagógico governados.

## Estados iniciais

`PROPOSED`, `PLANNED`, `RUNNING`, `WAITING`, `REVIEWING`, `VALIDATED`, `REJECTED`, `CONSOLIDATED`, `ARCHIVED`, `CANCELLED`.

## Primeiro marco técnico

O primeiro núcleo executável é formado por:

- contrato de missão;
- manifesto de agente;
- contrato de atribuição;
- máquina de estados da missão;
- validadores determinísticos;
- testes unitários;
- documentação de integração com o Kernel existente.

## Missão-piloto

Inventariar, classificar e preparar a consolidação das branches atuais do `apidevelopers-platform`, sem merge, deploy ou alteração de produção.
