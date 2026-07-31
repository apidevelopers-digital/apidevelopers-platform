# Evidência API dos datacenters Hostinger

Esta etapa pertence à **Onda 13** e implementa a política institucional API-only.

## Objetivo

Executar um preflight real e somente leitura na Hostinger API e publicar a lista sanitizada de datacenters em uma branch dedicada do GitHub, tornando a evidência consultável diretamente pela GitHub API.

## Fluxo

1. `GET /api/hosting/v1/datacenters?order_id={order_id}` na Hostinger API.
2. Validação das flags de segurança do preflight.
3. Sanitização do pedido e remoção de qualquer credencial.
4. Criação ou atualização, pela GitHub REST API, do arquivo:

```text
branch: evidence/hostinger-datacenters
path: apps/site-factory/evidence/hostinger-datacenters-latest.json
```

## Limites

O workflow:

- não chama `POST /api/hosting/v1/websites`;
- não cria website;
- não conecta repositório;
- não envia arquivo;
- não inicia build;
- não configura DNS;
- não executa deploy;
- não altera produção;
- não altera WordPress;
- não usa uni.desk, navegador, espelhamento ou automação por clique.

A única escrita é a evidência sanitizada no GitHub, em branch e caminho fixos.

## Workflow

```text
.github/workflows/site-factory-hostinger-datacenter-evidence.yml
```

Runner institucional:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

Permissões:

```yaml
permissions:
  contents: write
```

A permissão de escrita é usada somente pelo GitHub REST API para atualizar o arquivo de evidência dedicado.

## Evidência publicada

O JSON contém:

- repositório e SHA de origem;
- ID do run;
- fingerprint e horário do preflight;
- pedido mascarado;
- códigos, títulos e coordenadas dos datacenters;
- fingerprint SHA-256 da evidência;
- confirmação explícita de ausência de escrita na Hostinger, DNS, build, deploy, produção e WordPress.

## Execução

O workflow é manual. Seu disparo é uma escrita real no GitHub e exige aprovação explícita separada após o merge.
