# @apidevelopers/gateway-core

Domínio canônico de autorização de chamadas e registro de consumo da API Developers.digital.

## Responsabilidades

- receber somente identidade pública de API Key já resolvida;
- validar que a API Key está ativa e vinculada ao tenant, projeto e assinatura;
- consultar `entitlement-core` antes de liberar a chamada;
- consultar `limits-core` antes de liberar a chamada;
- registrar consumo em `usage-core` somente após conclusão bem-sucedida;
- impedir dupla contagem por idempotência;
- manter histórico append-only e snapshots imutáveis;
- bloquear segredos, bearer tokens, senhas e credenciais em metadados;
- emitir eventos canônicos para observabilidade e faturamento.

## Fluxo

```text
identidade pública de API Key
  → entitlement.assertAccess
  → limits.evaluate
  → gateway.authorized
  → execução externa
  → usage.recordUsage
  → gateway.completed
```

Chamadas bloqueadas ou falhas não registram consumo.

## Fronteiras

- o pacote não recebe nem valida o segredo bruto da API Key;
- autenticação criptográfica pertence ao adaptador de borda e ao `apikey-core`;
- o pacote não faz proxy HTTP nem chama provedores externos;
- `entitlement-core`, `limits-core` e `usage-core` são dependências injetadas;
- o efeito externo é executado fora do domínio, entre `authorize` e `complete`.

## Eventos

- `gateway.requested`
- `gateway.authorized`
- `gateway.blocked`
- `gateway.completed`
- `gateway.failed`

## Validação

```bash
npm --prefix packages/gateway-core run check
```
