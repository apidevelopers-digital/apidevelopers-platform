# MITRA PROFESSIONAL — BLOCO A V1

Status: candidato de produto em branch; não autoriza merge, deploy, DNS, billing ou escrita no banco do Escritório.

## Objetivo

Consolidar a Mitra Profissional como bancada jurídica SaaS para o advogado, separada do modo Escritório.

A experiência do Bloco A reúne:

1. Pesquisa jurídica pública com fontes;
2. Assistente jurídico retrieval-first;
3. Jurimetria read-only;
4. Documentos como rascunho estrutural efêmero;
5. Veritas para checagem governada.

## Trust boundary

O modo Profissional não recebe nem desbloqueia:

- `client_id`;
- dossier/caso privado;
- sessão do Escritório;
- memória privada;
- documentos privados persistidos;
- permissões de tenant;
- escrita em banco.

Credenciais do orquestrador permanecem somente server-side no API Gateway.

## Rotas do gateway

Pesquisa pública:

- `GET /v1/mitra/public/health`
- `POST /v1/mitra/public/search`

Mitra Profissional:

- `GET /v1/mitra/professional/health`
- `POST /v1/mitra/professional/analyze`
- `POST /v1/mitra/professional/jurimetrics`
- `POST /v1/mitra/professional/veritas`
- `POST /v1/mitra/professional/document/preview`

## Motores

- Pesquisa pública: provider público oficial configurado no gateway; o candidato atual usa Câmara dos Deputados — Dados Abertos.
- Assistente: delega server-side para o orquestrador institucional em `/v1/analyze`.
- Jurimetria: delega server-side para `/v1/jurimetrics/search` e força `dry_run=false` apenas como consulta read-only; nenhuma escrita é permitida.
- Veritas: delega server-side para `/v1/veritas`.
- Documentos: preview estrutural local no gateway, efêmero, sem assinatura, protocolo, persistência ou conclusão jurídica final.

## Política de segurança

Todas as capacidades do modo Profissional obedecem:

- CORS allowlist;
- rate limit;
- timeout;
- HTTPS fora de localhost;
- `credentials: omit` no browser;
- bearer somente server-side;
- sanitização de resposta;
- bloqueio de campos privados inesperados;
- `persistence=false`;
- `database_write_allowed=false`;
- `write_executed=false`;
- `human_review_required=true`;
- `final_legal_conclusion_disabled=true`.

## Runtime protegido

As capacidades Assistente, Jurimetria e Veritas ficam `fail-closed` quando o bearer server-side do orquestrador não está configurado.

Variáveis candidatas de runtime:

- `MITRA_PROFESSIONAL_ORCHESTRATOR_BASE_URL`
- `MITRA_PROFESSIONAL_ORCHESTRATOR_BEARER`
- `MITRA_PROFESSIONAL_ALLOWED_ORIGINS`
- `MITRA_PROFESSIONAL_TIMEOUT_MS`
- `MITRA_PROFESSIONAL_RATE_LIMIT_MAX`
- `MITRA_PROFESSIONAL_RATE_LIMIT_WINDOW_MS`

Nenhum segredo deve ser commitado.

## Definição de pronto do Bloco A

O Bloco A só é concluído após:

1. CI do gateway verde;
2. CI da interface Mitra verde;
3. provider público real validado;
4. merge explicitamente aprovado;
5. runtime pinado publicado com aprovação explícita;
6. configuração server-side do orquestrador sem exposição do bearer;
7. preview/produção da interface publicada com aprovação explícita;
8. E2E real comprovando pesquisa + saúde da camada profissional e, quando configuradas, capacidades protegidas;
9. nenhuma regressão na separação Profissional × Escritório.

## Fora do Bloco A

Pertencem aos blocos seguintes:

- login e identidade comercial;
- checkout, assinatura e entitlement;
- tenant do Escritório;
- clientes e casos;
- memória privada;
- documentos persistidos;
- equipe e permissões;
- gravação no banco do Escritório.

Essas funções não devem ser simuladas no Bloco A.
