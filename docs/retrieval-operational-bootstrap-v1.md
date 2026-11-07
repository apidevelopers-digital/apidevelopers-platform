# Retrieval Operational Bootstrap v1

**Status:** preparação segura de runtime; sem deploy e sem ativação de providers.

## Objetivo

Conectar o ciclo de startup do `api-gateway` a um bootstrap de retrieval que seja inerte por padrão e falhe fechado antes de qualquer provider real quando alguém tentar ativá-lo sem wiring governado explícito.

## Contrato atual

- feature flag: `RETRIEVAL_ENABLED`;
- ausência da variável ou `false` => runtime `disabled`;
- modo `disabled` não importa nem inicializa `kernel-retrieval`;
- `search` e `fetchContent` do runtime desabilitado sempre recusam execução;
- `true` sem `runtimeFactory` governado => `RETRIEVAL_OPERATIONAL_WIRING_REQUIRED`;
- `true` sem `resolveRuntimeOptions` governado => `RETRIEVAL_OPERATIONAL_WIRING_REQUIRED`;
- runtime habilitado precisa retornar `status=ready`;
- runtime habilitado precisa expor pelo menos um connector governado;
- o descriptor anexado ao gateway contém apenas estado e IDs, nunca conteúdo.

## Managed Hosting

O `hostinger-entry.mjs` anexa o bootstrap antes das demais composições Hostinger. O artefato gerenciado contém o módulo de bootstrap, mas **não precisa empacotar `kernel-retrieval` nesta etapa**, porque a configuração de produção permanece desativada e o caminho de ativação é deliberadamente bloqueado até existir wiring governado explícito.

Isso evita que um deploy futuro com a configuração atual abra providers apenas pela presença do código.

## Fora do escopo

- habilitar `RETRIEVAL_ENABLED=true`;
- empacotar providers reais;
- credenciais;
- leitura de e-mail, WhatsApp, processo, documento ou prontuário;
- R5 real;
- deploy;
- alteração de kill-switch.

## Próximo gate

Antes de permitir `RETRIEVAL_ENABLED=true`, uma entrega separada deve:

1. empacotar `@apidevelopers/kernel-retrieval` no artefato de produção;
2. injetar autenticação/autorização/política/auditoria/redação;
3. injetar apenas providers aprovados;
4. executar `createRetrievalActivationPreflight`;
5. manter R5 condicionado a aprovação por objeto/finalidade;
6. obter aprovação explícita para deploy e, separadamente, para ativação da feature flag.
