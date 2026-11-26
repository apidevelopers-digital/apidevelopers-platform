# ADA Enterprise 3 Tool Pack

Data: 2026-11-26
Frente: `ada-enterprise-3-tool-pack`
Branch de trabalho: `ada/enterprise-3-tool-pack-runway-media`
Status: runway inicial / sem deploy / sem consumo de créditos

## Decisão operacional

Igor decidiu parar de remendar ADA Enterprise 1 e ADA Enterprise 2 para novas integrações de mídia, geração, billing e publicação.

A nova frente será preparada como um pacote separado, provisoriamente chamado **ADA Enterprise 3 Tool Pack**, com backend próprio e exposição posterior como terceiro conector/plugin.

## Objetivo

Criar, organizar e versionar um backend/pacote de ferramentas para vídeo, mídia, billing, geração, empacotamento, preview público e publicação futura sem quebrar as ferramentas existentes da Enterprise 1/2.

## Estrutura alvo

```text
apps/ada-enterprise-3/
apps/ada-enterprise-3/app/tools/runway_tools.py
apps/ada-enterprise-3/app/tools/grok_billing_tools_v2.py
apps/ada-enterprise-3/app/tools/elevenlabs_tools_v2.py
apps/ada-enterprise-3/app/tools/media_package_tools.py
apps/ada-enterprise-3/app/tools/hydra_preview_tools.py
apps/ada-enterprise-3/app/tools/billing_compare_tools.py
docs/operacional/ada-enterprise-3-tool-pack.md
```

## Ferramentas planejadas

### Runway

| Ferramenta | Risco | Status | Observação |
|---|---:|---|---|
| `runway.assets.status` | R1/R2 | planejada | Verificar chave/configuração e capacidade de listar/validar assets sem gerar mídia. |
| `runway.billing.status` | R1/R2 | planejada | Verificar créditos/status sem expor segredo. |
| `runway.video.generate_to_package` | R4/R5 | planejada | Gerar vídeo para pacote; exige confirmação real. |
| `runway.video.job_status` | R1/R2 | planejada | Consultar task/job e resultado sanitizado. |

Estado conhecido:
- API key criada no painel.
- `RUNWAYML_API_SECRET` salvo no servidor.
- Chave já apareceu como presente no container.
- Conta com 1.000 créditos.
- Camada final MCP ainda não criada.
- Não gerar vídeo sem confirmação explícita.

Confirmação obrigatória para gasto de crédito:

```text
IGOR_APROVA_RUNWAY_VIDEO_REAL
```

Fluxo esperado:

```text
Runway API -> task/job -> download do resultado -> pacote Reels -> Hydra preview -> revisão -> render/postagem
```

### Grok / xAI billing v2

| Ferramenta | Risco | Status | Observação |
|---|---:|---|---|
| `grok.billing.status.v2` | R1/R2 | planejada | Reimplementar status de billing de forma independente da Enterprise 1/2. |

Estado conhecido:
- Existem 2 chaves de geração.
- Existem 2 Management Keys.
- Consulta de saldo já funcionou anteriormente.
- Último saldo confirmado: conta 1 US$ 4.92; conta 2 US$ 5.00; total US$ 9.92.
- `grok.billing.status` já existe em outra camada, mas Enterprise 3 deve poder ter v2 independente.

### ElevenLabs v2

| Ferramenta | Risco | Status | Observação |
|---|---:|---|---|
| `elevenlabs.status.v2` | R1/R2 | planejada | Status/configuração. |
| `elevenlabs.voices.v2` | R1/R2 | planejada | Listagem sanitizada de vozes. |
| `elevenlabs.tts.generate_to_package` | R4/R5 | planejada | Gerar áudio para pacote; exige confirmação quando houver custo. |
| `elevenlabs.usage.status` | R1/R2 | planejada | Uso/cotas sem expor segredo. |

Confirmação sugerida:

```text
IGOR_APROVA_ELEVENLABS_TTS_REAL
```

### Pacote de mídia / Reels

| Ferramenta | Risco | Status | Observação |
|---|---:|---|---|
| `media.package.status` | R1/R2 | planejada | Status do pacote. |
| `media.package.materialize` | R3/R4 | planejada | Materializar pacote intermediário; escrita exige confirmação. |
| `media.package.list_assets` | R1/R2 | planejada | Listar assets do pacote. |
| `media.package.add_asset` | R3/R4 | planejada | Adicionar asset ao pacote. |
| `media.package.hash_asset` | R1/R2 | planejada | Calcular/validar hash. |

Confirmação sugerida para escrita:

```text
IGOR_APROVA_MEDIA_PACKAGE_WRITE
```

Objetivo: padronizar pacote intermediário para vídeos, áudios, legendas, prompts, thumbnails e manifests.

### Hydra preview

| Ferramenta | Risco | Status | Observação |
|---|---:|---|---|
| `hydra.assets.status` | R1/R2 | planejada | Status de assets públicos/preview. |
| `hydra.preview.publish` | R4/R5 | planejada | Publicar preview público; exige confirmação. |
| `hydra.preview.from_package` | R3/R4 | planejada | Preparar preview a partir do pacote. |
| `hydra.preview.check_url` | R1/R2 | planejada | Checar URL pública Hydra. |

Regra obrigatória:

> Nunca entregar caminho interno `/opt/...` como link final para Igor. Sempre entregar URL pública Hydra.

Confirmação sugerida:

```text
IGOR_APROVA_HYDRA_PUBLISH_REAL
```

### Billing / custos consolidados

| Ferramenta | Risco | Status | Observação |
|---|---:|---|---|
| `media.billing.status` | R1/R2 | planejada | Status consolidado de provedores de mídia. |
| `video.billing.compare` | R1/R2 | planejada | Comparar custos entre provedores. |
| `video.cost.estimate` | R1/R2 | planejada | Estimar custo antes de gerar mídia. |

Comparar custos entre Grok, Runway, ElevenLabs e outros modelos futuros.

### Futuras integrações reservadas

- Kling
- Veo
- Seedance
- Pika
- Luma
- Adobe
- Meta/Instagram publishing
- YouTube Shorts
- TikTok
- Scheduler de stories/reposts

## Princípios de segurança

- Ferramentas de leitura/status podem ser R1/R2.
- Ferramentas que geram vídeo, áudio, publicação, postagem ou gastam crédito exigem confirmação explícita.
- Não expor tokens, API keys, `.env`, Bearer tokens, URLs assinadas temporárias ou segredos.
- Separar dry-run de execução real.
- Retornar hashes, ids, status e URLs públicas quando aplicável.
- Nunca gerar vídeo sem confirmação explícita.
- Nunca publicar preview sem confirmação explícita.
- Nunca postar em redes sociais sem aprovação específica posterior.

## Confirmações sugeridas

```text
IGOR_APROVA_RUNWAY_VIDEO_REAL
IGOR_APROVA_ELEVENLABS_TTS_REAL
IGOR_APROVA_HYDRA_PUBLISH_REAL
IGOR_APROVA_MEDIA_PACKAGE_WRITE
IGOR_APROVA_ENTERPRISE3_DEPLOY
```

## Fluxo completo de vídeo alvo

```text
1. video.cost.estimate
2. runway.billing.status
3. runway.assets.status
4. runway.video.generate_to_package (dry-run primeiro)
5. runway.video.job_status
6. media.package.materialize
7. media.package.hash_asset
8. hydra.preview.from_package
9. hydra.preview.publish
10. hydra.preview.check_url
11. revisão humana
12. render/postagem em ferramenta futura
```

## Primeiro incremento técnico

Prioridade inicial:

1. `runway.assets.status`
2. `runway.billing.status`
3. `runway.video.generate_to_package`
4. `runway.video.job_status`

Critério do primeiro teste:

- validar presença/configuração de chave sem imprimir segredo;
- validar status/créditos se a API permitir;
- validar contrato de criação de task apenas em dry-run;
- não gerar vídeo;
- não consumir crédito;
- não baixar arquivo;
- não publicar preview;
- não mexer na Enterprise 1/2.

## Status de teste

| Área | Status |
|---|---|
| Branch criada | preparada |
| Documento-base | preparado |
| Runway secret no servidor | informado como presente |
| Runway billing/status | pendente |
| Runway task dry-run | pendente |
| Geração real de vídeo | bloqueada por confirmação |
| Hydra preview | pendente |
| Deploy Enterprise 3 | bloqueado por confirmação |

## Não fazer nesta etapa

- Não alterar ADA Enterprise 1/2 para as novas ferramentas.
- Não fazer deploy.
- Não gerar vídeo.
- Não consumir crédito.
- Não expor segredo.
- Não publicar preview.
- Não postar em redes sociais.
- Não retornar URL interna `/opt/...` como entrega.
