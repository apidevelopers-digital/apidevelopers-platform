# Mapa de ambientes — referência canônica

O mapa institucional de produção e pré-produção é mantido no repositório:

`apidevelopers-digital/apidevelopers-institution`

Documento canônico:

`architecture/PRODUCTION_PREPRODUCTION_ENVIRONMENT_MAP_V1_2026-08-17.md`

Resumo operacional:

- produtos possuem interfaces/domínios próprios;
- produção de produto consome `unico.sitedauni.com`;
- preview de produto consome `unico-staging.sitedauni.com`;
- não criar staging de backend por produto sem necessidade arquitetural explícita;
- segredos centrais ficam no runtime seguro do UNICO, nunca no frontend ou no Git;
- produção e staging devem ser isolados;
- `merge != deploy`.

Este arquivo é apenas um ponteiro. Em caso de divergência, prevalece o documento canônico institucional.
