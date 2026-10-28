# Revisao contratual Hostinger Node TUS — 2026-10-28

Escopo: PR #737, branch `fix/site-factory-hostinger-node-tus-20261025`, HEAD analisado `1d0e0db30c65ac0ab1a43b9ebad05d5d18a8d745`. Exclusivamente dry-run.

## Evidencia do Contract Monitor #180

Fonte: https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40688822019

Indicadores extraidos das annotations do GitHub Actions:
- `legacyEndpointMissing=true`: remocao do endpoint legado confirmada pelo monitor; nao restaurar `/nodejs/builds/from-archive`.
- `currentArchiveFlowDocumented=true`: fluxo atual de archive documentado.
- `contractChanged=true`: ha transicao contratual; nao equivale por si so a erro de serializacao.
- `apiVersionChanged=true`: versao oficial mudou em relacao a referencia historica.
- `issueChanged=true` e `officialIssueClosed=true`: issue oficial #56 encerrada; nao e liberacao de producao.
- `reviewRequired=true`: a revisao humana permanece obrigatoria.

## Evidencia funcional

- Site Factory CI #198: sucesso (https://github.com/apidevelopers-digital/apidevelopers-platform/actions/runs/40688822029).
- Teste offline de serializacao contra fixture OpenAPI 2.5.1 foi incluido anteriormente na branch. Fixture offline nao substitui inspecao do schema oficial em cada execucao.
- Contract Monitor #180: falha no gate fail-closed, conforme politica. Os indicadores acima explicam a transicao esperada; nao provam ausencia de todo drift possivel.

## Decisao tecnica

As mudancas de endpoint legado, fluxo archive, versao e issue sao esperadas na migracao. Manter monitor e revisao fail-closed; **nao** classificar um CI vermelho nesse gate como aprovacao para merge. Nao declarar homologacao ponta a ponta nem habilitar upload/build reais com base apenas nesses indicadores.

## Bloqueios e proxima verificacao

`writesEnabled=false`; `buildStartAllowed=false`; `remoteBuildStarted=false`; `productionExecutionAllowed=false`.
Sem merge, deploy, upload TUS real, POST real de build ou alteracao em DNS.
Proxima verificacao: obter snapshot oficial vigente na revisao, comparar schema `Hosting.V1.NodeJs.StartBuildRequest` e caminho `archive_path` com o serializador, e registrar aprovacao humana especifica antes de qualquer passo de producao.
