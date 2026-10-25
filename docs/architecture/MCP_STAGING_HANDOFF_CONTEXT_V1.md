# MCP staging — handoff de identidade v1

**Estado:** contrato de laboratório, desabilitado por padrão e sem montagem HTTP.  
**Repositórios:** `apidevelopers-platform` (esta implementação) e `apidevelopers-mcp-brain` PR #171.  
**Destino proposto:** `https://mcp-staging.apidevelopers.digital` — **não há evidência de DNS, serviço ativo ou deploy**.

## Por que esta mudança existe

O handoff atual é autorizado apenas para `uni-preview`. O código
`packages/auth-core/src/browser-session-handoff.mjs` oferece PKCE S256, uso único,
validade curta e origem permitida, mas o resultado de resgate não contém prova
única vinculada à sessão original nem o horário original da autenticação.

O PR #171 do MCP Brain exige identidade validada antes do grant. Sua emissão
ainda precisa ser conectada à política dos escopos efetivos do usuário.

## Contrato isolado

`apps/api-gateway/src/mcp-staging-handoff-context.mjs` oferece
`createMcpStagingHandoffContext`, que **não** cria servidor, endpoint, grant,
cookie, segredo ou conexão com produção. O padrão é `enabled: false`.

Para um teste de laboratório, um integrador precisará fornecer:

- `redeemHandoff`: resgate S2S confiável, autenticado e de uso único,
  preservando S256 e um `redemptionProofId` único emitido pelo servidor;
- `resolveSessionEvidence`: leitura autorizada e confiável da sessão de origem
  vinculada ao `redemptionProofId`, com revogação, expiração, `authenticatedAt`,
  escopos efetivos e decisão de política;
- identidade do servidor de resgate, tenant esperado, audiência, lista de
  escopos do cliente OAuth e lista de escopos do tenant.

Regras: destino de staging fixo, validação estrita de tenant/redeemer,
`S256`, sessão ativa, hora **original** de login com idade máxima de 900 s,
idade do handoff limitada a 90 s (ajustável sob limites) e autorização
somente quando cada escopo solicitado existir nas permissões do **cliente,
tenant, principal autenticado, usuário e política**.

Não usa cabeçalhos do navegador, `ADA_OAUTH_AUTHORIZE_SUBJECT` nem horário da
emissão do handoff como prova de login; todas as falhas são *fail-closed*.

## Restrições antes da integração E2E

1. A resposta atual `browser-session-handoff/v1` **não contém**
   `redeemerId` e `redemptionProofId`. O novo contrato falhará até haver
   prova S2S autorizada; os testes usam apenas simuladores.
2. A sessão autenticada atual não retorna `authenticatedAt` original; o
   backend deve consultar evidência persistida e verificar vínculo e
   revogação da sessão.
3. Os escopos reais de `uni-preview` incluem `web:chat`; isso **não**
   autoriza `mcp:tools:read`.
4. O gateway OAuth do PR #171 deve fazer valer os escopos efetivos
   antes de gerar grant. Os objetos aqui produzidos são **dados de contrato**,
   não autorização final para emitir tokens.
5. Não ativar sem destino staging validado, credenciais S2S protegidas
   pelo gerenciador de segredos e teste ponta a ponta com aprovação específica.

## Teste sem rede nem credenciais

```sh
node --check apps/api-gateway/src/mcp-staging-handoff-context.mjs
node --test apps/api-gateway/test/mcp-staging-handoff-context.test.mjs
```

O PR Draft não altera o handoff de `uni-preview`, a aplicação montada,
o OAuth do Claude, DNS, VPS ou produção. Merge e deploy não estão autorizados.
