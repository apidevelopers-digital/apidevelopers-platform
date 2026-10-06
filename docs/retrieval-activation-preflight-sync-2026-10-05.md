# Retrieval Activation Preflight — sync checkpoint

Este checkpoint existe apenas para gerar o evento `synchronize` do PR #691 após a mudança da base para `main`, permitindo nova execução dos CIs canônicos.

Não altera runtime, feature flag, kill-switch, providers, conteúdo real, deploy ou produção.
