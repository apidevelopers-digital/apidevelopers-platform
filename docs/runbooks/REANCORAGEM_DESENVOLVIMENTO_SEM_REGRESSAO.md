# Reancoragem operacional — desenvolvimento sem regressão

## Estado

Este runbook transforma a reancoragem canônica em um gate técnico repetível. Ele não autoriza deploy, release, staging ou publicação.

## Princípio

Cada janela deve tratar o HEAD compartilhado como volátil. Nenhuma branch antiga é promovida apenas porque seus testes passaram anteriormente.

## Ciclo obrigatório

1. Ler o HEAD exato da branch compartilhada.
2. Conferir commits recentes, branches paralelas e trabalhos equivalentes.
3. Ler os arquivos atuais antes de alterar.
4. Criar branch temporária ancorada no SHA exato.
5. Trabalhar apenas em caminhos exclusivos.
6. Executar `node scripts/reanchor-preflight.mjs` antes de instalar dependências.
7. Executar testes segmentados e a CI da frente.
8. Não elevar percentual com CI vermelha, cancelada ou ausente.
9. Revalidar o HEAD compartilhado imediatamente antes da promoção.
10. Se avançou, reconstruir numa branch limpa; não continuar empilhando correções na branch antiga.
11. Comparar base e head; exigir relação `ahead` sem divergência.
12. Promover somente por fast-forward com `force: false`.
13. Conferir as CIs no SHA compartilhado promovido.

## Gate de manifestos

O preflight bloqueia antes do `npm install`:

- JSON inválido;
- pacote sem nome;
- nomes de pacote duplicados;
- protocolo `workspace:*`, incompatível com a convenção atual do repositório;
- dependência interna `@apidevelopers/*` sem pacote correspondente.

## Percentuais

Dois percentuais devem ser reportados:

- **frente atual:** somente itens com código, testes e CI verde;
- **prontidão comercial global:** ponderação de jornadas integradas, persistência, segurança, operação e live.

Código escrito sem validação não aumenta percentual.

## Falhas e correção

Quando uma falha ocorrer:

1. registrar o run e o SHA;
2. identificar se é falha de código, contrato, manifesto, ambiente ou concorrência;
3. corrigir a causa, não apenas o sintoma;
4. adicionar teste ou preflight que torne a falha impossível de repetir silenciosamente;
5. reancorar se o compartilhado tiver avançado;
6. repetir a CI na branch limpa;
7. promover somente após evidência verde.

## Limites

Continuam proibidos sem aprovação explícita:

- deploy;
- release;
- staging;
- publicação pública;
- segredo real;
- cobrança real;
- banco remoto;
- DNS;
- force push.
