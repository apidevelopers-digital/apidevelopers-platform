# Portal Institucional + Aprendizado — Especificação UX v1

**Status:** pronto para implementação incremental  
**Mutação:** proibida na v1  
**Fluxo:** fontes canônicas → projetores determinísticos → snapshots derivados → API de leitura → portal

## Objetivo e invariantes

A primeira experiência visual deve apresentar contexto institucional, versão, origem, integridade, registros e aprendizado, sempre em modo somente leitura.

O Portal não pode ser fonte de verdade, acessar banco/broker/provider, armazenar credenciais, cruzar tenants, autorizar ações, aprovar propostas, executar operações ou introduzir mutação. Ações futuras devem seguir:

`Portal → API Gateway → autenticação → autorização/políticas → domínio → persistência/outbox → auditoria → resposta`

## Jornadas

### Leitura institucional
1. Confirmar contexto autorizado, versão e atualização.
2. Ler resumo e indicadores.
3. Conferir integridade, fontes e projetor.
4. Navegar por registros e módulos.
5. Retornar à visão geral mantendo o contexto.

### Governança
1. Abrir integridade e rastreabilidade.
2. Conferir fontes, contrato e idade da projeção.
3. Consultar evidências e correlação.
4. Reconhecer política ou falta de permissão.
5. Encaminhar ação para fluxo humano externo.

### Aprendizado
1. Consultar memórias e achados.
2. Abrir proposta pendente.
3. Ver `Não aprovada`, evidências e origem.
4. Confirmar aprovação humana obrigatória.
5. Não encontrar aprovação ou execução.

### Indisponibilidade
A interface deve distinguir vazio, erro, bloqueio, falta de permissão e defasagem; nova tentativa só aparece em erro recuperável.

## Navegação

- **Visão Geral:** resumo, indicadores, integridade e aprendizado recente.
- **Registros:** lista e detalhe derivados.
- **Módulos:** projeções, estado, versão e atualização.
- **Aprendizado:** memórias, achados, propostas e evidências.
- **Rastreabilidade:** fontes, projetores, versões e correlação.

Regras: breadcrumb, contexto atual, seletor apenas quando autorizado, selo persistente `Somente leitura`, versão sempre visível e nenhum cruzamento de tenants.

## Primeira tela — Visão Institucional

### Cabeçalho
- contexto e escopo autorizado;
- versão e última atualização;
- selo `Somente leitura`;
- acesso à integridade.

### Conteúdo
1. resumo institucional derivado;
2. indicadores de registros, módulos, versões, alertas e idade;
3. integridade e origem: fontes, projetor, contrato e defasagem;
4. Aprendizado: memórias, achados, propostas `Não aprovadas` e evidências;
5. rodapé técnico com versões, política e correlação permitida.

### Separação visual
- leitura disponível usa superfície neutra e alta legibilidade;
- ação indisponível usa texto, não apenas cor;
- proposta pendente usa `Não aprovada`;
- política mostra motivo seguro;
- defasagem mostra horário e idade;
- falta de permissão não revela objetos protegidos;
- controles de edição, aprovação e execução não existem.

## Contratos visuais

A implementação deve mapear os payloads reais da API, sem persistência paralela.

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
  error?: { code: string; message: string; retryable: boolean };
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

`approved` é apenas leitura de decisão canônica externa. O Portal nunca altera esse estado.

Regras de consumo: somente gateway; preservar origem/versão/correlação; não inferir autorização; não persistir resposta sensível; não combinar tenants; não converter política em vazio; não ocultar `stale`.

## Estados

- **Carregando:** skeleton, texto explícito, sem valores falsos.
- **Vazio:** ausência legítima, mantendo origem, versão e horário.
- **Erro:** código estável, mensagem segura, recuperabilidade e correlação permitida.
- **Bloqueado:** selo de política, motivo seguro, sem contorno ou dado protegido.
- **Sem permissão:** não revelar existência de objetos fora do escopo.
- **Somente leitura:** selo persistente e ausência de edição/aprovação/execução.
- **Desatualizado:** selo, horário, idade e motivo; defasagem nunca ocultada.

## Wireframes textuais

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Portal Institucional | contexto | vX | há N min | [Somente leitura] │
├───────────────┬──────────────────────────────────────────────────────┤
│ Visão Geral   │ Resumo institucional                                │
│ Registros     │ [Registros] [Módulos] [Versões] [Alertas]           │
│ Módulos       │ Integridade: fontes • projetor • contrato • idade    │
│ Aprendizado   │ Aprendizado: memórias • achados                     │
│ Rastreabilidade│ propostas [Não aprovadas] • evidências             │
└───────────────┴─────────────────────────────────────────────────────┘
```

```text
Proposta: [título]                                 [Não aprovada]
Somente leitura • Aprovação humana obrigatória
Resumo derivado
Evidências e rastreabilidade
[Ação indisponível neste Portal]
```

```text
Conteúdo bloqueado por política
Motivo seguro • identificador permitido
Nenhum dado protegido foi carregado.
[Voltar]
```

## Matriz leitura × ação

| Capacidade | v1 |
|---|---|
| Consultar snapshot, registros, módulos e aprendizado | Permitido |
| Aprovar, rejeitar, executar ou editar | Indisponível |
| Atualizar projeção manualmente | Indisponível |
| Trocar tenant sem autorização | Bloqueado |
| Acessar infraestrutura | Proibido |

## Plano incremental

0. **Contratos:** validar payloads, campos, erros, políticas e rotas somente leitura.
1. **Shell:** cabeçalho, navegação, selo, estados e cliente via gateway.
2. **Visão Institucional:** resumo, indicadores, integridade, registros e módulos.
3. **Aprendizado:** memórias, achados, propostas e evidências.
4. **Robustez:** fontes, correlação, defasagem, acessibilidade, política e tenant.
5. **Endurecimento:** testes de contrato, segurança, acessibilidade e telemetria segura.

## Critérios de aceite

- [ ] toda tela comunica `Somente leitura`;
- [ ] origem, versão e defasagem são acessíveis;
- [ ] propostas pendentes aparecem como `Não aprovadas`;
- [ ] nenhuma aprovação ou execução pode ser disparada;
- [ ] todos os estados estão cobertos;
- [ ] erro de política não vira vazio;
- [ ] não há acesso direto à infraestrutura;
- [ ] não há cruzamento de tenants;
- [ ] APIs passam pelo gateway e políticas;
- [ ] dados derivados não viram fonte canônica;
- [ ] interface não armazena credenciais.

## Fora de escopo

Mutação, aprovação, execução, persistência, outbox, providers, Rule Engine, gateway-core, projetores, workflows, deploy, release e publicação externa.

## Decisões antes do código

Confirmar framework/local do app, contrato HTTP final, autenticação, cache somente leitura, exposição de IDs/evidências, critério de defasagem, tokens de acessibilidade e telemetria permitida.
