# REANCORAGEM CANÔNICA — CONTAS GITHUB E IDENTIDADE INSTITUCIONAL

**Data:** 2026-07-22  
**Status:** CANÔNCOH
**Escopo:** identidade, propriedade e referência operacional no GitHub

## 1. Distinção obrigatória entre as duas contas

Existem duas identidades diferentes e elas não devem ser tratadas como equivalentes.

### Conta pessoal

- **GitHub:** `sitedauni`
- **Natureza:** conta pessoal
- **Referência operacional:** Uni
- **Papel:** cliente, ambiente pessoal e ativos específicos da Uni
- **Não representa:** a organização responsável pelo desenvolvimento institucional

### Conta da organização

- **GitHub:** `apidevelopers-digital`
- **Natureza:** organização
- **Referência institucional:** API.digital
- **Papel:** organização que projeta, desenvolve, mantém e opera a plataforma e seus produtos
- **Repositório institucional atual:** `apidevelopers-digital/apidevelopers-platform`

## 2. Relação correta

A relação canônica é:

```text
API.digital
  → organização desenvolvedora
  → constrói e opera produtos, plataformas e serviços
  → atende a Uni como cliente
```

A Uni não é a identidade da organização desenvolvedora.

A Uni é uma conta pessoal e um cliente atendido pela API.digital.

## 3. Regra de nomenclatura

Em trabalhos de:

- arquitetura;
- engenharia;
- desenvolvimento;
- CI/CD;
- governança;
- documentação institucional;
- operação da plataforma;
- construção do multiagente;

usar a referência **API.digital**.

Usar **Uni** somente quando o contexto for:

- conta pessoal;
- cliente;
- operação específica do cliente;
- ativos, produtos ou serviços pertencentes ao ambiente da Uni.

## 4. Regra para janelas e agentes

A janela central de construção institucional deve possuir nome vinculado à organização.

Exemplo correto:

```text
API.digital — Comando Institucional
```

Exemplos de janelas especialistas:

```text
API.digital — Arquitetura e Governança
API.digital — Engenharia Core
API.digital — Qualidade e CI
API.digital — Memória Institucional
API.digital — Integração e Operação
```

Não usar `Uni—Mrer Comando Institucional` para coordenar o desenvolvimento da organização.

## 5. Regra para repositórios

Para desenvolvimento institucional:

- a organização `apidevelopers-digital` é a referência canônica;
- o repositório `apidevelopers-digital/apidevelopers-platform` é a fonte atual de verdade;
- referências antigas sob `sitedauni` devem ser tratadas como históricas, pessoais ou legadas, conforme o caso;
- nenhuma documentação deve confundir o proprietário pessoal com a organização.

## 6. Regra de decisão 

Antes de nomear uma janela, agente, documento, pacote ou operação, perguntar:

```text
Isto pertence à organização que desenvolve
ou ao cliente pessoal atendido por ela?
```

Se pertence à organização, usar **API.digital*.

Se pertence ao cliente pessoal, usar **Uni**.

## 7. Estado canônico resumido

```yaml
conta_pessoal:
  github: sitedauni
  referencia: Uni
  papel: cliente_pessoal

organizacao:
  github: apidevelopers-digital
  referencia: API.digital
  papel: organizacao_desenvolvedora

repositorio_institucional:
  nome: apidevelopers-platform
  owner: apidevelopers-digital
  caminho: apidevelopers-digital/apidevelopers-platform

relacao:
  organizacao: API.digital
  cliente: Uni
  regra: API.digital constroi e opera; Uni e cliente
```

## 8. Regra permanente

> API.digital é a organização desenvolvedora.  
> Uni é a conta pessoal e cliente da organização.  
> As duas identidades nunca devem ser fundidas em documentação, operação ou nomenclatura.
