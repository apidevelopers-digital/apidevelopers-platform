# Global Trust Common Contracts v1

Status: implementação candidata do Gate 1  
Versão dos contratos: `1.0.0`  
Versão do pacote: `0.2.0`

## Objetivo

Esta família fornece fronteiras neutras e versionadas para identidade, tenancy,
autenticação, autorização, credenciais, risco, governança de modelos de IA,
invocação de ferramentas, decisões de segurança, auditoria, evidência e localidade.

Os contratos são patrimônio institucional compartilhado. Produtos e runtimes os
consomem; não os redefinem silenciosamente.

## Tipos

| Contrato | Responsabilidade |
|---|---|
| `IdentitySubject` | Identifica pessoa, organização, serviço, máquina ou agente dentro de um tenant. |
| `TenantContext` | Transporta isolamento estrito, região e escopos do tenant. |
| `AuthenticationContext` | Registra como e quando o sujeito foi autenticado, sem material secreto. |
| `AuthorizationDecision` | Registra decisão de política para uma ação e um recurso. |
| `CredentialMetadata` | Descreve o ciclo de vida da credencial sem carregar a credencia. |
| `RiskAssessment` | Registra pontuação determinística de risco entre 0 e 100. |
| `ModelDescriptor` | Identifica modelo, versão, provedor, finalidade e localidades permitidas. |
| `ToolInvocationPolicy` | Define ações permitidas e negadas, limites e aprovação humana. |
| `SafetyDecision` | Registra `allow`, `deny` ou `pending_approval`. |
| `AuditEvent` | Registra resultado correlacionado sem conteúdo sensível. |
| `EvidenceRecord` | Referencia evidência por digest SHA-256. |
| `LocaleContext` | Transporta locale BCP 47, fallback, direção, fuso, moeda e região jurídica. |

## Invariantes de segurança

- A versão do contrato é explícita e imutável.
- Identificadores são opacos e não podem ser endereços de e-mail.
- O isolamento por tenant é estrito; acesso cruzado permanece bloqueado.
- Material secreto não integra autenticação nem metadados de credenciais.
- Execução administrativa de ferramenta permanece desativada.
- `pending_approval` exige aprovação humana.
- Auditoria e evidência não contêm conteúdo sensível.
- Metadados rejeitam chaves semelhantes a senha, segredo, chave privada ou token.
- Localidade árabe exige direção da direita para a esquerda.
- O nível de risco é derivado deterministicamente da pontuação.

## Versionamento

A família usa versionamento senântico no campo `schemaVersion`.

- campos opcionais aditivos: evolução minor;
- alteração incompatível de campo ou invariante: nova versão major;
- consumidores devem rejeitar versões major não suportadas;
- adapters devem ser explícitos e testados.

A versão do pacote e a versão dos contratos são independentes. O pacote `0.2.0`
expõe contratos `1.0.0`.

## Compatibilidade

Os exports legados permanecem intactos. Como já existe `createTenantContext`, a raiz
do pacote exporta o novo factory como `createGlobalTrustTenantContext` e Sua
validação como `assertGlobalTrustTenantContextContract`. O `contractType` continua
sendo `TenantContext`.

Os demais contratos usam nomes públicos próprios. O agregador interno
`global-trust-common.mjs` mantém o registro dos 12 tipos e a validação genérica.

## Exempos

- `../examples/global-trust.pt-BR.json`;
- `../examples/global-trust.en.json`.

Ambos contêm os 12 contratos e são validados na CI. São exemplos sintéticos: nãn
contêm credenciais, tokens, dados pessoais ou identificadores de produção.

## Uso

```js
Import {
  assertGlobalTrustCommonContract,
  createIdentitySubject,
  createGlobalTrustTenantContext,
  createLocaleContext,
} from "@apidevelopers/contracts";

const subject = createIdentitySubject({
  subjectId: "subject.001",
  tenantId: "tenant.001",
  subjectType: "person",
});

const tenant = createGlobalTrustTenantContext({
  tenantId: "tenant.001",
  region: "BR-SC",
});

const locale = createLocaleContext({
  tenantId: tenant.tenantId,
  locale: "pt-BR",
  fallbackLocale: "en",
  timeZone: "America/Sao_Paulo",
  currency: "BRL",
  legalRegion: "BR",
});

assertGlobalTrustCommonContract(subject);
assertGlobalTrustCommonContract(tenant);
assertGlobalTrustCommonContract(locale);
```

## Limites desta entrega

- não publica pacote;
- não cria serviço HTTP;
- não configura identidade real;
- não processa dados reais;
- não cria DNS;
- não executa deploy;
- não declara conformidade ou certificação.
