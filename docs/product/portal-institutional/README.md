# Portal Institucional + Aprendizado — Especificação UX v1

**Status:** pronto para implementação incremental  
**Escopo:** documentação da primeira experiência visual  
**Mutação:** proibida na v1  
**Arquitetura:** fontes canônicas → projetores determinísticos → snapshots derivados → API de leitura → portal

## Objetivo

Entregar uma visão institucional confiável, rastreável e somente leitura, integrada ao Portal de Aprendizado. A interface deve mostrar contexto, versão, origem, integridade, registros e aprendizado sem virar fonte paralela de verdade, aprovar propostas ou executar ações.

## Invariantes

O Portal nunca deve:

- acessar banco, broker, outbox ou provider diretamente;
- armazenar credenciais;
- cruzar tenants;
- autorizar, aprovar ou executar sozinho;
- introduzir mutação na v1;
- ocultar origem, versão, defasagem ou condição de somente leitura.

Toda ação futura deverá seguir:

`Portal → API Gateway → autenticação → autorização/políticas → domínio → persistência/outbox → auditoria → resposta`

## Jornadas principais

### Leitura institucional

1. A pessoa acessa o Portal e confirma contexto autorizado, versão e atualização.
2. Lê o resumo institucional e os indicadores.
3. Verifica integridade, fontes e projetor.
4. Navega por registros e módulos.
5. Retorna à visão geral sem perder o contexto.

### Governança e rastreabilidade

1. Abre o painel de integridade.
2. Confere fontes canônicas, versão do contrato e idade da projeção.
3. Consulta evidências e IDs relacionados.
4. Reconhece bloqueios por política ou permissão.
5. Encaminha eventual ação para o fluxo humano externo.

### Aprendizado

1. Abre a seção Aprendizado.
2. Consulta memórias e achados recentes.
3. Abre uma proposta pendente.
4. Vê o selo `Não aprovada`, evidências e origem.
5. Confirma que aprovação humana é obrigatória.
6. Não encontra controles de aprovação ou execução.

### Indisponibilidade

1. A interface distingue vazio, erro, bloqueio e falta de permissão.
2. Exibe mensagem segura e recuperabilidade.
3. Mostra correlação quando permitido.
4. Só oferece nova tentativa em falha recuperável.

## Navegação v1

- **Visão Geral:** resumo, indicadores, integridade e aprendizado recente.
- **Registros:** lista e detalhe derivados, com filtros somente leitura.
- **Módulos:** projeções disponíveis, estado, versão e atualização.
- **Aprendizado:** memórias, achados, propostas e evidências.
- **Rastreabilidade:** fontes, projetores, versões e correlação.

Regras globais:

- breadcrumb e contexto atual;
- seletor de contexto apenas quando autorizado;
- selo persistente `Somente leitura`;
- versão da projeção sempre acessível;
- nenhuma troca ou combinação de tenants fora das políticas.

## Primeira tela — Visão Institucional

### Cabeçalho

- contexto institucional;
- tenant ou escopo autorizado, quando aplicável;
- versão da projeção;
- última atualização;
- selo `Somente leitura`;
- acesso ao painel de integridade.

### Conteúdo

1. **Resumo institucional**
   - título e descrição derivados;
   - estado geral;
   - alertas de integridade ou defasagem.

2. **Indicadores**
   - registros;
   - módulos/projeções;
   - versões;
   - alertas;
   - idade da projeção.

3. **Integridade e origem**
   - fontes canônicas;
   - projetor;
   - versão do contrato;
   - atualização;
   - condição de dados potencialmente desatualizados.

4. **Aprendizado integrado**
   - memórias recentes;
   - achados recentes;
   - propostas pendentes com selo `Não aprovada`;
   - evidências e rastreabilidade.

5. **Rodapé técnico**
   - política de somente leitura;
   - versões do Portal e do contrato;
   - ID de correlação, quando permitido.

### Linguagem visual

- leitura disponível: superfícies neutras e alta legibilidade;
- ação indisponível: rótulo textual, não apenas cor;
- proposta: selo `Não aprovada`;
- política: ícone, título e motivo seguro;
- defasagem: horário e idade da projeção;
- permissão: não revelar objetos fora do escopo;
- edição: ausente, não apenas escondida.

## Contratos de dados da interface

Os tipos abaixo descrevem o contrato visual. A implementação deve mapear os payloads reais da API, sem criar persistência paralela.

```ts
type ReadEnvelope<T> = {
  data: T | null;
  meta: {
    readOnly: true;
    generatedAt: string;
    projectionVersion: string;
    contractVersion?: string;
    sourceIds?: string[];
    projector?: string;
    stale?: boolean;
    staleReason?: string;
    correlationId?: string;
  };
  access: {
    allowed: boolean;
    reason?: "UNAUTHENTICATED" | "FORBIDDEN" | "POLICY_BLOCKED";
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};
```

```ts
type InstitutionalSnapshot = {
  context: { id: string; label: string; tenantId?: string };
  summary: { title: string; description?: string; status?: string };
  indicators: Array<{
    id: string;
    label: string;
    value: number | string;
    status?: "ok" | "attention" | "unavailable";
  }>;
  records: InstitutionalRecordSummary[];
  modules: InstitutionalModuleSummary[];
  versions: Array<{ id: string; label: string; createdAt?: string }>;
  integrity: {
    status: "healthy" | "degraded" | "unknown";
    sources: Array<{ id: string; label?: string; version?: string }>;
    warnings: string[];
  };
};
```

```ts
type LearningSnapshot = {
  memories: LearningMemory[];
  findings: LearningFinding[];
  proposals: LearningProposal[];
  evidence: LearningEvidence[];
};

type LearningProposal = {
  id: string;
  title: string;
  summary?: string;
  status: "pending" | "rejected" | "approved";
  approvalRequired: true;
  approvedAutomatically: false;
  evidenceIds: string[];
  createdAt?: string;
};
```

`approved` representa apenas leitura de estado canônico decidido fora do Portal. O Portal nunca altera esse estado.

### Regras de consumo

- consumir somente APIs de leitura via gateway;
- preservar versão, origem e correlação;
- tolerar campos opcionais sem esconder falha total;
- não inferir autorização pela presença de dados;
- não persistir resposta sensível no cliente;
- não combinar snapshots de tenants;
- não converter erro de política em vazio;
- nunca ocultar `stale: true`.

## Estados obrigatórios

### Carregando

- skeleton preservando hierarquia;
- texto `Carregando projeção institucional`;
- nenhum zero ou dado provisório falso;
- timeout vira erro recuperável.

### Vazio

- distinguir `nenhum registro projetado` de indisponibilidade;
- manter origem, versão e horário;
- não sugerir criação na v1.

### Erro

- título, mensagem segura e código estável;
- indicação de recuperabilidade;
- `Tentar novamente` apenas quando aplicável;
- correlação quando permitida;
- sem stack trace.

### Bloqueado por política

- selo `Bloqueado por política`;
- motivo seguro e identificador permitido;
- nenhum controle de contorno;
- nenhum dado protegido carregado.

### Sem permissão

- mensagem direta;
- não confirmar existência de objetos protegidos;
- navegação apenas para áreas autorizadas;
- nenhuma troca de tenant não autorizada.

### Somente leitura

- selo persistente;
- ausência de edição, aprovação e execução;
- textos: `Leitura disponível`, `Ação indisponível neste Portal` e `Aprovação humana obrigatória`.

### Dados desatualizados

- selo `Potencialmente desatualizado`;
- horário, idade e motivo quando fornecido;
- dados podem continuar visíveis se a política permitir;
- defasagem nunca é ocultada.

## Wireframes textuais

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Portal Institucional  Contexto autorizado  [Somente leitura] [Integridade] │
│ Projeção vX • atualizada há N min • contrato vY                            │
├────────────────┬───────────────────────────────────────────────────────────┤
│ Visão Geral    │ Resumo institucional                                     │
│ Registros      │ [Título e descrição derivados]                            │
│ Módulos        │ [Registros] [Módulos] [Versões] [Alertas]                 │
│ Aprendizado    │                                                           │
│ Rastreabilidade│ Integridade e origem                                      │
│                │ fontes • projetor • versão • atualização                   │
│                │                                                           │
│                │ Aprendizado                                               │
│                │ memórias | achados | propostas [Não aprovadas]            │
│                │ evidências e rastreabilidade                              │
└────────────────┴─────────────────────────────────────────────────────────┘
```

### Detalhe de proposta

```text
Proposta: [título]                                      [Não aprovada]
Somente leitura • Aprovação humana obrigatória

Resumo
[conteúdo derivado]

Evidências
- [evidência]
- [evidência]

Rastreabilidade
origem • versão • data • IDs relacionados

[Ação indisponível neste Portal]
```

### Bloqueio

```text
[Ícone] Conteúdo bloqueado por política

Este conteúdo não pode ser exibido neste contexto.
Política: [identificador seguro]
Nenhum dado protegido foi carregado.

[Voltar para Visão Geral]
```

### Mobile

```text
[Portal Institucional] [Somente leitura]
Contexto autorizado • projeção vX • há N min

[Resumo]
[Indicadores]
[Integridade e origem]
[Aprendizado recente]
  memórias
  achados
  propostas [Não aprovadas]
  evidências

[Geral | Registros | Aprendizado | Origem]
```

## Matriz leitura × ação

| Capacidade | v1 |
|---|---|
| Consultar snapshot, registros e módulos | Permitido |
| Consultar memórias, achados, propostas e evidências | Permitido |
| Aprovar, rejeitar ou executar proposta | Indisponível |
| Editar registro | Indisponível |
| Atualizar projeção manualmente | Indisponível |
| Trocar tenant sem autorização | Bloqueado |
| Acessar infraestrutura | Proibido |

## Plano incremental

### Fase 0 — Contratos

- confirmar payloads reais Institutional e Learning;
- mapear campos obrigatórios e opcionais;
- definir erros e políticas;
- congelar contrato visual v1;
- validar que todas as rotas são somente leitura.

### Fase 1 — Shell

- shell, cabeçalho e navegação;
- selo de somente leitura;
- estados globais;
- cliente via gateway;
- fixtures contratuais sem mutação.

### Fase 2 — Visão Institucional

- resumo;
- indicadores;
- integridade e origem;
- registros e módulos resumidos;
- versão e idade da projeção.

### Fase 3 — Aprendizado

- memórias e achados;
- propostas `Não aprovadas`;
- evidências;
- detalhe somente leitura.

### Fase 4 — Robustez

- fontes, versões e correlação;
- estados parciais e defasagem;
- acessibilidade;
- testes de política e isolamento de tenant.

### Fase 5 — Endurecimento

- testes de contrato e acessibilidade;
- testes de segurança da interface;
- telemetria sem conteúdo sensível;
- documentação e critérios de aceite.

## Critérios de aceite

- [ ] toda tela comunica `Somente leitura`;
- [ ] versão e origem são acessíveis;
- [ ] propostas pendentes aparecem como `Não aprovadas`;
- [ ] nenhuma aprovação ou execução pode ser disparada;
- [ ] todos os estados obrigatórios estão cobertos;
- [ ] erro de política não vira vazio;
- [ ] não existe acesso direto a infraestrutura;
- [ ] não existe cruzamento de tenants;
- [ ] APIs passam pelo gateway e pelas políticas;
- [ ] dados derivados não são tratados como fonte canônica;
- [ ] contratos visuais têm testes;
- [ ] a interface não armazena credenciais.

## Fora de escopo

Mutação, aprovação, execução, persistência própria, outbox, providers, Rule Engine, gateway-core, projetores, workflows, deploy, release e publicação externa.

## Decisões necessárias antes do código visual

1. framework e local canônico do aplicativo;
2. contrato HTTP final de Institutional e Learning;
3. autenticação da interface;
4. cache somente leitura;
5. exposição permitida de IDs e evidências;
6. critério objetivo de defasagem;
7. tokens visuais e acessibilidade;
8. telemetria permitida.
