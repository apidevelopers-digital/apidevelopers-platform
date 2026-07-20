# Contrato executável do projetor do Portal

**Status:** canônico — contrato pré-implementação  
**Fonte de verdade:** Git  
**Escopo:** projeções de leitura do Portal  
**Proibição:** nenhuma escrita na fonte canônica

## 1. Finalidade

Definir o comportamento observável que uma implementação do projetor deve cumprir. Este documento é executável no sentido de fornecer entradas, saídas, invariantes, códigos de falha e critérios testáveis, mas não declara que o projetor já foi implementado.

## 2. Entrada fixada por commit

Toda execução recebe uma referência imutável:

```yaml
repository: sitedauni/apidevelopers-platform
commit: <full-sha>
root_paths:
  - docs/architecture
schema_version: portal.projector-input/v1
```

Regras:

1. `commit` deve ser SHA completo e existente.
2. Branch pode ser registrada como contexto, nunca como substituta do commit.
3. Todos os arquivos da execução são lidos do mesmo commit.
4. O projetor rejeita mistura de conteúdo entre commits.
5. HEAD móvel só pode ser resolvido antes da execução e deve ser persistido como SHA.

## 3. Pipeline determinístico

```text
resolve commit
→ enumerate canonical sources
→ read immutable blobs
→ normalize content
→ extract records
→ validate structure
→ order canonically
→ serialize canonically
→ calculate SHA-256
→ stage projection set
→ publish atomically
→ reconcile
```

Para a mesma entrada, versão do projetor e configuração, a saída lógica e o checksum devem ser idênticos.

## 4. Extração

A extração deve:

- preservar IDs canônicos;
- gerar `SourceRef` para cada registro;
- registrar path, commit e checksum da origem;
- rejeitar IDs duplicados;
- rejeitar relações com extremos inexistentes;
- preservar estados não reconhecidos como erro explícito, nunca corrigi-los silenciosamente;
- não inferir aprovação, evidência ou maturidade ausente;
- não consultar conteúdo fora do commit fixado.

Metadados não determinísticos, como horário de execução, ficam fora do conteúdo lógico usado no checksum.

## 5. Validação estrutural

Antes de publicar, validar pelo menos:

- schema e versão suportados;
- presença dos campos obrigatórios;
- unicidade de IDs;
- integridade referencial;
- validade de `SourceRef`;
- existência do commit;
- checksums das fontes;
- enumerações canônicas;
- isolamento de tenant quando aplicável;
- ausência de segredo conhecido no conjunto projetado;
- contagens e checksum final.

Falha estrutural impede publicação.

## 6. Projeções reconstruíveis

O conjunto publicado deve ser integralmente reconstruível a partir de:

- repositório;
- commit;
- versão do projetor;
- versão do schema;
- configuração não secreta;
- lista de caminhos de entrada.

Nenhuma correção manual no armazenamento derivado é permitida. Correções devem ocorrer na fonte canônica ou no projetor versionado, seguidas de reconstrução.

## 7. Serialização e SHA-256

A representação lógica canônica deve:

1. usar UTF-8;
2. normalizar quebras de linha;
3. ordenar chaves de objetos;
4. ordenar coleções quando a semântica não depender de ordem;
5. preservar ordem quando explicitamente semântica;
6. distinguir campo ausente de campo nulo;
7. excluir metadados de execução não determinísticos;
8. calcular SHA-256 sobre os bytes serializados.

Envelope mínimo:

```json
{
  "schemaVersion": "portal.projection/v1",
  "sourceCommit": "<full-sha>",
  "projectorVersion": "<version>",
  "recordCount": 0,
  "contentChecksum": "<sha256>",
  "records": []
}
```

## 8. Publicação atômica

O projetor publica um conjunto completo, nunca registros parciais:

1. gerar em área de staging derivada;
2. validar todos os artefatos;
3. recalcular checksum;
4. comparar contagens;
5. gravar manifesto;
6. trocar o ponteiro corrente de forma atômica;
7. preservar a última projeção válida;
8. registrar `AuditEvent`.

Falha antes da troca mantém a versão anterior. Falha depois da troca deve ser detectável e reversível pelo manifesto anterior.

## 9. Reconciliação

Após publicar, o reconciliador deve comparar:

- commit esperado e commit servido;
- checksum esperado e observado;
- contagem por tipo;
- IDs ausentes, órfãos ou divergentes;
- versão do schema;
- versão do projetor;
- integridade dos links de origem.

Estados mínimos:

- `in_sync`
- `stale`
- `divergent`
- `invalid`
- `unavailable`

Somente `in_sync` pode ser apresentado como visão corrente sem alerta.

## 10. Nenhuma escrita canônica

O projetor:

- não cria commit;
- não altera documento;
- não atualiza branch;
- não faz merge;
- não aprova ação;
- não executa deploy;
- não corrige automaticamente a fonte;
- não promove estado institucional;
- não escreve em domínios comerciais.

Saídas permitidas são artefatos derivados, manifests, diagnósticos, evidências e eventos de auditoria.

## 11. Interface mínima proposta

```js
project({
  repository,
  commit,
  rootPaths,
  schemaVersion,
  projectorVersion
}) => {
  manifest,
  projections,
  diagnostics
}
```

A função deve ser pura em relação à fonte canônica. Adaptadores de Git e armazenamento ficam fora do núcleo determinístico.

## 12. Códigos de falha

- `PORTAL_PROJECTOR_COMMIT_NOT_FOUND`
- `PORTAL_PROJECTOR_MIXED_COMMIT_INPUT`
- `PORTAL_PROJECTOR_SOURCE_INVALID`
- `PORTAL_PROJECTOR_DUPLICATE_ID`
- `PORTAL_PROJECTOR_DANGLING_RELATION`
- `PORTAL_PROJECTOR_SCHEMA_UNSUPPORTED`
- `PORTAL_PROJECTOR_CHECKSUM_MISMATCH`
- `PORTAL_PROJECTOR_PUBLISH_FAILED`
- `PORTAL_PROJECTOR_RECONCILIATION_FAILED`
- `PORTAL_PROJECTOR_CANONICAL_WRITE_ATTEMPT`

## 13. Casos de teste obrigatórios

1. mesma entrada gera mesmo checksum;
2. ordem física não semântica não muda o checksum;
3. mudança canônica muda o checksum;
4. commit inexistente falha antes da extração;
5. IDs duplicados impedem publicação;
6. relação órfã impede publicação;
7. falha no staging preserva a projeção válida anterior;
8. troca atômica nunca expõe conjunto parcial;
9. reconciliação detecta projeção stale;
10. tentativa de escrita canônica é bloqueada;
11. nenhuma leitura cruza o commit fixado;
12. metadado temporal não altera o checksum lógico.

## 14. Limites atuais

Este contrato não define ainda:

- linguagem ou runtime;
- nome definitivo do pacote;
- armazenamento derivado;
- transporte da API;
- autenticação;
- infraestrutura de execução;
- deploy;
- release.

Essas escolhas devem ocorrer somente após nova conferência de pacotes paralelos e criação de caminho exclusivo.
