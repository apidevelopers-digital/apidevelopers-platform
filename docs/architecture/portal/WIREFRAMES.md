# Wireframes Conceituais do Portal

**Status:** proposta documental  
**Escopo:** composição estrutural das principais telas  
**Não define:** framework, biblioteca visual ou implementação final

## 1. Convenções

Os wireframes usam blocos conceituais. Eles não determinam pixels, cores ou tecnologia.

Símbolos:

- `[estado]` indicador operacional;
- `{ação}` controle permitido;
- `<origem>` referência rastreável;
- `!` atenção, bloqueio ou divergência;
- `...` conteúdo expansível.

## 2. Visão geral

```text
┌ Contexto: branch · revisão · projeção · idade ┐
├ Alertas persistentes                          ┤
├ Saúde geral ─ Atenção ─ Bloqueios ─ Divergências
├ Mudanças recentes                             ┤
├ Gates críticos                                ┤
└ Próximas ações permitidas                     ┘
```

Requisitos:

- contexto sempre visível;
- cada indicador abre a fila correspondente;
- alertas persistem enquanto a condição existir;
- cards exibem origem e instante.

## 3. Fila operacional

```text
┌ Contexto e busca global                       ┐
├ Filtros ativos · ordenação · densidade        ┤
├ Resumo: atenção | bloqueados | pendentes      ┤
├──────────────────────┬────────────────────────┤
│ Lista operacional    │ Detalhe selecionado    │
│ [estado] item        │ Estado e motivo        │
│ [estado] item        │ Gates                  │
│ [estado] item        │ Evidências             │
│ ...                  │ {ações permitidas}     │
└──────────────────────┴────────────────────────┘
```

Em largura compacta, o detalhe abre em tela própria e o retorno preserva a posição da fila.

## 4. Detalhe do item

```text
┌ Identificação · estado · domínio              ┐
├ <SourceRef> · projeção · temporalidade        ┤
├ Resumo e impacto                              ┤
├ Dependências                                  ┤
├ Gates                                         ┤
├ Evidências                                    ┤
├ Divergências                                  ┤
├ Histórico                                     ┤
└ {leitura} {preparação} {aprovação} {execução} ┘
```

Os grupos de ação devem permanecer separados visualmente.

## 5. Gate

```text
┌ Gate: nome · [estado]                         ┐
├ Requisito                                     ┤
├ Evidência esperada                            ┤
├ Evidência encontrada                          ┤
├ Autoridade necessária                         ┤
├ Impacto do bloqueio                           ┤
└ {abrir origem} {preparar requisito}           ┘
```

Um gate falho não oferece execução sensível.

## 6. Divergência

```text
┌ ! Divergência · impacto · idade               ┐
├ Projeção                 │ Fonte              ┤
│ valor · instante         │ valor · instante   │
├ Campos conflitantes                           ┤
├ Tentativas de reconciliação                   ┤
└ {abrir origem} {reconciliar}                  ┘
```

Os dois lados recebem peso visual equivalente.

## 7. Aprovação

```text
┌ Solicitação · estado · validade               ┐
├ Ação proposta                                 ┤
├ Escopo e impacto                              ┤
├ Evidências                                    ┤
├ Autoridade requerida                          ┤
├ Dry-run ou comparação                         ┤
├ Restrições e rollback                         ┤
└ {solicitar} {aprovar} {rejeitar} {cancelar}   ┘
```

Somente ações compatíveis com o estado e a autoridade aparecem habilitadas.

## 8. Evidência

```text
┌ Evidência · tipo · validade                   ┐
├ Origem e identificador                        ┤
├ Revisão ou hash                               ┤
├ Instante e idade                              ┤
├ Objetos correlacionados                       ┤
├ Confiança e limitações                        ┤
└ {abrir origem} {copiar referência}            ┘
```

Nenhum segredo ou payload sensível é apresentado.

## 9. Auditoria

```text
┌ Busca · filtros · intervalo                   ┐
├ Linha do tempo                                ┤
│ evento · ator · objeto · resultado            │
│ evento · ator · objeto · resultado            │
├ Detalhe selecionado                           ┤
└ Referências e evidências                      ┘
```

## 10. Estados vazios e falhas

```text
┌ Estado: vazio | parcial | erro | indisponível ┐
├ O que foi consultado                          ┤
├ O que está ausente                            ┤
├ Fontes consultadas e pendentes                ┤
├ Impacto                                       ┤
└ {atualizar} {limpar filtros} {abrir origem}   ┘
```

## 11. Critérios de aceitação

- a hierarquia funciona sem depender de cor;
- contexto e origem aparecem antes das ações;
- ações sensíveis ocupam região separada;
- telas compactas preservam o fluxo completo;
- estados vazios explicam a ausência;
- cada wireframe suporta teclado e leitores de tela;
- nenhum wireframe presume execução concluída sem evidência.
