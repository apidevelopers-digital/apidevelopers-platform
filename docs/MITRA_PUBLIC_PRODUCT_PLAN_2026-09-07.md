# Mitra Pública — Plano de Landing, Login e Produto Comercial

Status: preparado
Data: 2026-09-07
Escopo: mitra.apidevelopers.digital
Execução real: pendente de aprovação explícita

## Decisão operacional

A Mitra pública deve ser publicada em:

```txt
mitra.apidevelopers.digital
```

Sem criar Node novo neste momento.

O Node/API operacional existente permanece como base de integração:

```txt
peterle-ops.apidevelopers.digital
```

O backend jurídico público existente permanece como referência técnica:

```txt
homosapiens-id/porta-juridica-publica
```

## Separação de modos

### Mitra Pública

Modo sem banco privado de clientes.

Finalidade:

- página pública de venda;
- login/entrada do produto;
- chatbot comercial/demonstrativo;
- pesquisa jurídica pública;
- fontes oficiais;
- DataJud/CNJ quando aplicável;
- base de livros/doutrina opcional, quando houver curadoria;
- captação de leads e demonstração.

Restrições:

- não usa banco da Milena/Peterle;
- não acessa clientes privados;
- não salva dados sensíveis sem contrato e consentimento;
- não produz conclusão jurídica final sem revisão humana;
- não expõe segredos.

### Mitra Escritório

Modo privado por escritório/cliente contratante.

Finalidade:

- clientes;
- processos/casos;
- documentos;
- memórias;
- busca interna detalhada por cliente;
- confirmação antes de salvar;
- auditoria de ações;
- operação jurídica ponta a ponta.

## Primeira entrega publicável

### Landing pública

Blocos mínimos:

1. Hero: “Mitra — assistente jurídico operacional”.
2. Proposta: pesquisa, jurimetria, memória e navegação.
3. Demonstração de comandos:
   - “Pesquise decisões sobre dano moral em comarca X.”
   - “Compare entendimentos por tribunal.”
   - “Explique uma tese com fontes.”
   - “No modo escritório, busque dentro de um cliente.”
4. Segurança:
   - fontes citadas;
   - revisão humana;
   - sem dados privados no modo público;
   - auditoria.
5. Planos:
   - Mitra Pública;
   - Mitra Escritório;
   - Mitra Estratégia/Jurimetria;
   - Mitra Enterprise.
6. CTA:
   - entrar;
   - pedir demonstração;
   - falar com equipe.

### Login

O login deve ser preparado como entrada de produto, mas sem amarrar a implementação ao banco da Milena.

Requisitos mínimos:

- tela de login;
- tela de cadastro/interesse;
- recuperação/contato;
- separação futura por tenant/escritório;
- integração posterior com gateway/autenticação institucional.

### Chatbot comercial

O chatbot inicial deve operar como demonstração segura:

- não consultar banco privado;
- explicar funcionalidades;
- coletar interesse;
- orientar uso;
- encaminhar para contratação;
- executar consultas públicas somente quando backend estiver disponível.

## Arquitetura de publicação

```txt
mitra.apidevelopers.digital
  -> landing pública + login + chatbot comercial

peterle-ops.apidevelopers.digital
  -> API Node operacional já existente

homosapiens-id/porta-juridica-publica
  -> backend público jurídico, sem banco privado
```

## Critérios de pronto

### Pronto para publicar landing

- subdomínio definido;
- raiz Hostinger definida;
- página estática ou app leve preparado;
- conteúdo comercial revisado;
- links de política/termos previstos;
- CTA funcional;
- sem segredos;
- sem dados privados.

### Pronto para ativar chatbot

- prompt/contrato do modo público;
- limites de uso;
- disclaimer jurídico;
- logs sem conteúdo sensível;
- handoff comercial;
- fallback quando backend jurídico estiver indisponível.

### Pronto para vender

- landing publicada;
- login/lead capture funcionando;
- demo estável;
- termos e privacidade;
- plano comercial;
- onboarding de escritório;
- separação entre público e privado;
- monitoramento básico.

## Próximos PRs recomendados

1. Criar `apps/mitra-public-landing` ou equivalente no repositório correto.
2. Criar conteúdo inicial da landing.
3. Criar checklist de deploy Hostinger para `mitra.apidevelopers.digital`.
4. Criar contrato do chatbot público.
5. Criar integração segura com `porta-juridica-publica`.
6. Criar smoke test de `/health` e página inicial após deploy.

## Segurança

Esta preparação não altera:

- DNS;
- Hostinger;
- deploy;
- banco;
- runtime;
- segredos;
- clientes privados.

Qualquer execução real de domínio, DNS, deploy, login ou publicação exige aprovação explícita.
