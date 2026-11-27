# ADA Enterprise 3 Tool Pack

Backend experimental e separado para novas ferramentas de mídia, vídeo, billing, pacote de Reels e preview Hydra.

## Estado

- Sem deploy.
- Sem conector público ainda.
- Sem consumo de crédito.
- Sem dependência operacional da ADA Enterprise 1/2.

## Primeiro incremento

Ferramentas Runway em camada segura:

- `runway.assets.status`
- `runway.billing.status`
- `runway.video.generate_to_package`
- `runway.video.job_status`

Todas as operações de geração real exigem confirmação explícita:

```text
IGOR_APROVA_RUNWAY_VIDEO_REAL
```

## Segurança

- Não imprimir segredos.
- Não retornar `.env`, Bearer token, API key ou URL assinada temporária.
- Separar dry-run de execução real.
- Retornar ids, hashes, status e URLs públicas quando aplicável.
