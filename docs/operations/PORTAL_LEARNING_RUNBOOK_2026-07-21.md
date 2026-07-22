# Runbook operacional — Portal Learning

**Data:** 2026-07-21  
**Estado:** CANÔNICO OPERACIONAL  
**Componente:** `@apidevelopers/portal-learning-worker`

## Princípio

O ciclo aprende, sintetiza e publica evidências somente leitura. Ele não aprova, altera nem executa mudanças institucionais.

## Modo operacional padrão

A execução padrão é sob demanda:

```bash
node scripts/apid.mjs learning
```

Execução contínua não é padrão. Só pode ser habilitada após decisão operacional explícita sobre frequência, retenção, observabilidade e capacidade do runner.

## Fontes e saídas

Fontes reais:

- `.audit/snapshot.json`;
- `generated/capabilities.validation.json`;
- `capabilities/*.json`.

Saídas derivadas:

- memória operacional;
- grafo institucional;
- relatório de evolução;
- snapshot `portal.learning-screen/v1`.

Os caminhos podem ser redirecionados por variáveis `PORTAL_LEARNING_*_PATH`.

## Retenção

Política padrão:

1. artefatos de CI ficam no diretório temporário do runner;
2. arquivos temporários não são versionados;
3. o snapshot atual pode ser substituído atomicamente;
4. histórico permanente não é criado automaticamente;
5. qualquer retenção histórica deve definir prazo, destino, controle de acesso e descarte.

## Consistência e concorrência

A publicação usa:

```text
arquivo final
→ temporário único com PID + UUID
→ escrita completa
→ rename atômico
→ limpeza em erro
```

Publicações concorrentes devem terminar com um snapshot JSON válido e sem temporários órfãos.

## Recuperação

O snapshot é derivado e regenerável. Em falha:

1. interromper novas execuções;
2. preservar logs e o último snapshot válido;
3. remover apenas temporários órfãos;
4. corrigir a causa em branch isolada;
5. executar os checks do worker;
6. executar `apid learning`;
7. validar HTTP `200`, `no-store` e gates;
8. promover somente por PR aprovado.

Não editar o snapshot manualmente como método de recuperação.

## Gates obrigatórios

```text
readOnly: true
humanApprovalRequired: true
mutationAllowed: false
executionAllowed: false
automaticApprovalAllowed: false
```

Qualquer desvio deve falhar fechado.

## Diagnóstico mínimo

Ordem recomendada:

1. auditoria institucional;
2. capability validation;
3. projeção do grafo;
4. memória e evolução;
5. publicação atômica;
6. leitura pelo repository;
7. rota HTTP;
8. compatibilidade da tela.

## Evidência de saúde

Uma execução saudável deve comprovar:

- produtores reais executados;
- pelo menos uma capability carregada;
- snapshot válido;
- endpoint `GET /v1/admin/learning` com `200`;
- `cache-control: no-store`;
- gates somente leitura preservados;
- ausência de arquivos `.tmp` órfãos.

## Mudanças sensíveis

Exigem decisão explícita:

- habilitar execução contínua;
- persistir histórico;
- publicar snapshot fora do ambiente controlado;
- alterar gates;
- executar deploy;
- remover branch ou artefatos de auditoria.

## Autoridade

- Igor: execução quando explicitamente autorizada;
- uni. Operador: preparação, diagnóstico, validação e evidência;
- automação: execução restrita ao contrato e aos gates.
