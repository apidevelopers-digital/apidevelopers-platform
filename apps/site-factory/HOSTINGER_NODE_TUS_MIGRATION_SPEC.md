# Hostinger Node.js TUS: especificacao de migracao (draft, 2026-10-26)

Status: somente leitura/dry-run, execucao real bloqueada. Contexto: PR #737 da branch `fix/site-factory-hostinger-node-tus-20261025`.

## Fontes verificadas
- OpenAPI oficial: https://github.com/hostinger/api/blob/main/openapi.json (OpenAPI 3.0.0, versao 2.3.0)
- Monitor: `.github/workflows/site-factory-hostinger-node-contract-monitor.yml`
- Classificador: `src/hostinger-node-upstream-drift.mjs`
- Planejador atual: `src/hostinger-node-tus-plan.mjs`
- O artefato completo do monitor #141 ainda nao foi lido nesta revisao; a classificacao exata do job nao e declarada aqui.

## Fluxo contratual documentado
1. `POST /api/hosting/v1/files/upload-urls` com `username` e `domain`, retorna URL e credenciais temporarias; HTTP 409 durante setup pode exigir `Retry-After`.
2. TUS 1.0.0: `POST` com `Upload-Length`/`Upload-Offset: 0`, esperado HTTP 201; `PATCH` com bytes e offsets, esperado HTTP 204; cabecalhos `X-Auth` e `X-Auth-Rest` sao secretos.
3. `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds` com JSON conforme `#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest`. A rota antiga `/nodejs/builds/from-archive` nao e valida como contrato atual.
4. Campos exigidos no body: `node_version`, `app_type`, `root_directory`, `output_directory`, `build_script`, `source_type`, `source_options`. `source_type=archive` exige `source_options.archive_path` relativo ao document root, apontando para arquivo ja existente no site. `entry_file` e `package_manager` sao opcionais. Alguns campos obrigatorios admitem `null`; esta nuance nao autoriza omiti-los. Versoes Node documentadas: 18, 20, 22, 24.
5. AVISO OFICIAL: iniciar um build bem-sucedido sobrescreve o conteudo existente do site, sem reversao pela API. Exige revisao humana separada e evidencia de backup antes da execucao.

## Lacunas confirmadas do planejador atual
- `buildRequest` contem `source_type` e `source_options`, mas nao modela os outros cinco campos obrigatorios do schema. Gerar um corpo completo apenas em dry-run, sem presumir defaults.
- Vincular o `archive_path` ao destino relativo do upload TUS; rejeitar path absoluto, travessia, divergencia e arquivo nao verificado.
- Validar tipo, campos obrigatorios e enumeracoes com testes negativos. Cobrir retomada TUS, offsets, 409/Retry-After, tamanho e SHA-256 somente em mocks.
- Nunca registrar `X-Auth`, `X-Auth-Rest`, tokens, URLs credenciadas ou conteudo de arquivos nos logs/artifacts.

## Portoes antes de habilitar qualquer escrita
1. Contrato atualizado comprovado com OpenAPI versionado, artefato do monitor revisto e regressao CI.
2. Payload dry-run completo, inputs validados, checksum/tamanho e identidade de conta/dominio conferidos.
3. Backup e plano de recuperacao revisados para o site especifico e risco de sobrescrita aceito explicitamente.
4. Guarda de autorizacao no limite do executor e testes mockados no runner institucional.
5. Aprovacao explicita e especifica para cada upload, build, merge ou deploy real, em etapas separadas.

## Decisao atual
`writesEnabled=false`; `remoteBuildStarted=false`; `productionExecutionAllowed=false`. Nenhuma chamada real da Hostinger foi autorizada.

Proximo passo tecnico seguro: serializador de `StartBuildRequest` em dry-run com testes positivos e negativos e guarda de execucao permanente.
