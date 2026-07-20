# Fluxos de Aprovação na Interface

**Status:** proposta modular de interface  
**Escopo:** preparação, solicitação, decisão e evidência de aprovação  
**Não altera:** papéis, autoridades, gates ou políticas institucionais

## 1. Objetivo

A interface deve tornar explícita a diferença entre:

- preparar uma ação;
- solicitar aprovação;
- registrar uma decisão;
- executar uma ação autorizada;
- confirmar resultado com evidência.

Nenhuma transição visual autoriza uma ação por si só.

## 2. Estados da solicitação

| Estado | Significado |
|---|---|
| rascunho | conteúdo ainda editável e não submetido |
| preparado | proposta pronta para conferência |
| aguardando aprovação | decisão solicitada à autoridade correta |
| alterações solicitadas | proposta devolvida para ajuste |
| aprovada | decisão registrada com escopo e validade |
| rejeitada | decisão negativa registrada |
| expirada | aprovação não pode mais ser usada |
| consumida | aprovação vinculada a uma execução específica |
| cancelada | solicitação encerrada sem execução |

Os estados pertencem à projeção do fluxo e não substituem o contrato institucional de autoridade.

## 3. Conteúdo mínimo da solicitação

Toda solicitação apresenta:

- ação proposta;
- objetivo;
- escopo;
- impacto;
- risco;
- reversibilidade;
- evidências;
- identidade do solicitante;
- autoridade necessária;
- validade;
- artefato ou revisão de origem;
- confirmação exigida pela ferramenta.

## 4. Preparação

Durante a preparação, o operador pode:

- revisar parâmetros não sensíveis;
- anexar referências;
- executar dry-run quando suportado;
- comparar antes e depois;
- registrar plano de rollback;
- identificar dependências e bloqueios.

Segredos nunca aparecem em texto aberto e não são armazenados pela documentação do Portal.

## 5. Solicitação de aprovação

Antes do envio, a interface valida:

1. autoridade correta;
2. escopo definido;
3. evidências mínimas;
4. validade;
5. impacto e reversibilidade;
6. ausência de dados proibidos;
7. correspondência entre proposta e dry-run.

Falhas impedem o envio e indicam exatamente o requisito ausente.

## 6. Decisão

A decisão registra:

- autoridade;
- resultado;
- instante;
- escopo aprovado;
- restrições;
- validade;
- referência da proposta;
- referência das evidências.

A interface não oferece aprovação automática, presumida ou herdada de outro escopo.

## 7. Execução vinculada

Uma execução sensível somente pode ser preparada para disparo quando:

- a aprovação estiver válida;
- o escopo for idêntico;
- a revisão da proposta não tiver mudado;
- os gates técnicos estiverem satisfeitos;
- a ferramenta conectada aceitar a confirmação exigida.

Mudança de parâmetro, revisão ou impacto invalida o vínculo e exige nova aprovação.

## 8. Evidência posterior

Após uma execução autorizada, o Portal deve projetar:

- identificador da operação;
- resultado;
- instante;
- escopo efetivo;
- evidências técnicas;
- divergência entre previsto e realizado;
- rollback quando aplicável.

Ausência de evidência posterior mantém o estado como não confirmado.

## 9. Experiência visual

A interface usa etapas separadas:

```text
Preparar -> Conferir -> Solicitar -> Decidir -> Executar -> Verificar
```

Cada etapa mostra responsável, requisitos, bloqueios e próxima transição permitida.

Botões de execução sensível devem ser visualmente distintos, nunca ocupar o mesmo nível de ações de leitura e exigir confirmação explícita da ferramenta.

## 10. Critérios de aceitação

- preparação não é confundida com aprovação;
- aprovação não é confundida com execução;
- escopo e revisão permanecem vinculados;
- mudança material invalida a aprovação;
- nenhuma autoridade é inferida pela interface;
- execução sem evidência permanece não confirmada;
- o histórico preserva todas as transições;
- segredos não são exibidos ou documentados.
