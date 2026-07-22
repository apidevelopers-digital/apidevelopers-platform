# REANCORAGEM CANÔNICA — CONTAS GITHUB E IDENTIDADE INSTITUCIONAL

**Data:** 2026-07-22  
**Status:** CANÔNICO  
**Escopo:** identidade, propriedade e referência operacional no GitHub

## 1. Distinção obrigatória entre as duas contas

Existem duas identidades diferentes e elas não devem ser tratadas como equivalentes.

### Conta pessoal

- **GitHub:** `sitedauni`
- **Natureza:** conta pessoal
- **Referência operacional:** `uni.`
- **Grafia obrigatória:** tudo minúsculo, com ponto final
- **Papel:** cliente, ambiente pessoal e ativos específicos da `uni.`
- **Não representa:** a organização responsável pelo desenvolvimento institucional

### Conta da organização

- **GitHub:** `apidevelopers-digital`
- **Natureza:** organização
- **Nome institucional:** `APIdevelopers.digital`
- **Papel:** organização que projeta, desenvolve, mantém e opera a plataforma e seus produtos
- **Repositório institucional atual:** `apidevelopers-digital/apidevelopers-platform`

## 2. Relação correta

A relação canônica é:

```text
APIdevelopers.digital
  → organização desenvolvedora
  → constrói e opera produtos, plataformas e serviços
  → atende a uni. como cliente
```

A `uni.` não é a identidade da organização desenvolvedora.

A `uni.` é uma conta pessoal e um cliente atendido pela `APIdevelopers.digital`.

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

usar a referência **APIdevelopers.digital**.

Usar **uni.** somente quando o contexto for:

- conta pessoal;
- cliente;
- operação específica do cliente;
- ativos, produtos ou serviços pertencentes ao ambiente da `uni.`

## 4. Regra para janelas e agentes

A janela central de construção institucional deve possuir nome vinculado à organização.

Exemplo correto:

```text
APIdevelopers.digital — Comando Institucional
```

Exemplos de janelas especialistas:

```text
APIdevelopers.digital — Arquitetura e Governança
APIdevelopers.digital — Engenharia Core
APIdevelopers.digital — Qualidade e CI
APIdevelopers.digital — Memória Institucional
APIdevelopers.digital — Integração e Operação
```

Não usar `uni. — Comando Institucional` para coordenar o desenvolvimento da organização.

## 5. Regra para repositórios

Para desenvolvimento institucional:

- a organização GitHub `apidevelopers-digital` é a referência canônica;
- o repositório `apidevelopers-digital/apidevelopers-platform` é a fonte atual de verdade;
- referências antigas sob `sitedauni` devem ser tratadas como históricas, pessoais ou legadas, conforme o caso;
- nenhuma documentação deve confundir o proprietário pessoal com a organização.

## 6. Regra de decisão

Antes de nomear uma janela, agente, documento, pacote ou operação, perguntar:

```text
Isto pertence à organização que desenvolve
ou ao cliente pessoal atendido por ela?
```

Se pertence à organização, usar **APIdevelopers.digital**.

Se pertence ao cliente pessoal, usar **uni.**.

## 7. Estado canônico resumido

```yaml
conta_pessoal:
  github: sitedauni
  referencia: "uni."
  grafia: "tudo minúsculo, com ponto final"
  papel: cliente_pessoal

organizacao:
  github: apidevelopers-digital
  nome: APIdevelopers.digital
  papel: organizacao_desenvolvedora

repositorio_institucional:
  nome: apidevelopers-platform
  owner: apidevelopers-digital
  caminho: apidevelopers-digital/apidevelopers-platform

relacao:
  organizacao: APIdevelopers.digital
  cliente: "uni."
  regra: "APIdevelopers.digital constrói e opera; uni. é cliente"
```

## 8. Regra permanente

> `APIdevelopers.digital` é a organização desenvolvedora.  
> `uni.` é a conta pessoal e cliente da organização.  
> A grafia `uni.` deve ser sempre minúscula e terminar com ponto.  
> As duas identidades nunca devem ser fundidas em documentação, operação ou nomenclatura.
