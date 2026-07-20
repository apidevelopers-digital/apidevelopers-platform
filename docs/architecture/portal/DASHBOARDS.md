# Dashboards do Portal

**Status:** proposta modular de interface  
**Escopo:** leitura e operação assistida sobre projeções canônicas  
**Não altera:** governança, contratos institucionais ou fonte de verdade

## 1. Princípios

1. Todo indicador exibido deve apontar para uma projeção e sua `SourceRef`.
2. O dashboard nunca transforma ausência de evidência em sucesso.
3. Estados desconheicidos, divergentes ou desatualizados permanecem visíveis.
4. Ações sensíveis aparecem separadas de ações de leitura.
5. O Portal não executa merge, release, deploy ou publicação por consequência implícita.

## 2. Dashboard inicial

A visão inicial deve responder, nesta ordem:

1. **O que está saudável?**
2. **O que exige atenção?**
3. **O que está bloqueado?**
4. **O que mudou recentemente?**
5. **Qual é a próxima ação permitida?**

Blocos sugeridos:

| Bloco | Conteúdo | Origem |
|---|---|---|
| Estado geral | contagem por estado operacional | projeção de status |
| Gates | checks concluúdos, pendentes e falhos | workflows e evidências |
| Mudanças recentes | commits, documentos e revisões | histórico Git |
| Divergências | projeções fora de sincronia | reconciliação |
| Próximas ações | ações permitidas pelo estado atual | política de interface |

## 3. Dashboard operacional

Voltado ao `uni. Operador`, com foco em decisão rápida:

- fila de itens pendentes;
- itens bloqueados por gate;
- operações em preparação;
- evidências mais recentes;
- ações que exigem aprovação explícita;
- histórico auditável da superfície selecionada.

Cada cartã deve exibir:

- nome curto;
- estado visual;
- última atualizaçã;

- origem;
- nível de confiança;
- próxima ação permitida;
- link para detalhes e evidências.

## 4. Dashboard de domínio

Cada domínio deve reutilizar a mesma estrutura:

```text
Resumo
Ä�stado atual
→ Dependências
→ Eventos recentes
→ Evidências
(→ Divergências
→ Ações permitidas
```

O domínio não pode inventar estados próprios incompatíveis com as projeções compartilhadas.

## 5. Estados visuais

|`Estado`|Tratamento|
|---|---|
| saudável | confirmação com evidência válida |
| atenção | dado parcial, atrasado ou incompleto |
| bloqueado | gate obrigatório não satisfeito |
| erro | falha confirmada |
| desconhecido | ausência de evidência suficiente |
| divergente | fontes derivadas ão reconciliadas |

Cores, ícones e texto devem sempre aparecer juntos. Cor isolada não é suficiente.

## 6. Atualização e temporalidade

Toda visualização temporal deve mostrar:

- instante da projeção;
- instante da fonte;
- idade do dado;
- estado de reconciliação;
- opção de atualizar quando aplicável.

Dados antigos não devem ser apresentados como atuais sem aviso explícito.

## 7. Critérios de aceite

O dashboard está documentalmente pronto quando:

- cada bloco possui projeção de origem definida;
- estados desconhecidos e divergentes têm tratamento próprio;
- ações senséveis estão isoladas;
- cada indicador permite chegar à evidência;
- a visão inicial funciona sem depender de um domínio específico.
