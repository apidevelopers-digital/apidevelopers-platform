# Mitra Public

Landing pública da Mitra em React/Vite, criada como **preview visual isolado** conforme `docs/mitra-public-product-plan.md`.

## Escopo desta entrega

- landing comercial responsiva;
- demonstração visual de pesquisa jurídica pública;
- apresentação da fronteira Mitra Pública × Mitra Escritório;
- chatbot comercial estático;
- login apenas como superfície visual;
- estrutura comercial de planos sem cobrança ativa.

## Fora do escopo

Esta entrega **não**:

- cria ou altera DNS;
- publica em produção;
- ativa autenticação real;
- chama banco privado;
- persiste clientes, memórias, documentos ou processos;
- habilita cobrança;
- conecta o chatbot a contexto privado;
- conecta a pesquisa pública ao gateway em produção.

## Execução local

```bash
npm install
npm test
npm run build
npm run dev
```

## Publicação

O contrato está em `publishing-manifest.json`.

Preview é obrigatório e qualquer promoção para produção requer aprovação explícita de Igor. O domínio alvo futuro permanece `mitra.apidevelopers.digital`.
