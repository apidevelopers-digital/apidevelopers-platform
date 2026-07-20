# Snapshot de continuidade — implementação inicial do Portal Projector

**Data:** 2026-07-20  
**Status:** IMPLEMENTAÇÃO_INICIAL_TESTADA  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Branch base:** `foundation/global-platform-bootstrap-20260715`  
**Branch temporária:** `work/portal-projector-v1-20260720`  
**HEAD inicial:** `d2e601cf1c2ff73e2b4d7f4c7539874db147e44a`  
**Fonte de verdade:** Git

## Escopo

Foi criado o pacote isolado:

`packages/portal-projector`

Nenhum arquivo de `activation-core`, `onboarding-core`, checkout, assinatura, provisionamento ou billing foi alterado.

## Microcommits

1. `a6427339198623e2e246c7fc083b22adb2a39b87` — manifesto do pacote.
2. `f26c7e58b10871f57dd08fd649abca3352feb83e` — núcleo determinístico.
3. `48f63c15d8ee7a870bd787dc4584f839eaf906cf` — testes dos invariantes.
4. `c5ae42881b716478f52e885bb3c010d7bdd70b16` — documentação da API.

## Capacidades implementadas

- entrada fixada por SHA completo;
- verificação de que todas as fontes pertencem ao mesmo commit;
- serialização canônica;
- checksum SHA-256;
- ordenação determinística;
- validação de IDs duplicados;
- validação de `SourceRef`;
- projeções reconstruíveis;
- reconciliação entre projeção esperada e observada;
- publicação atômica por adaptadores injetados;
- bloqueio de ativação quando staging não valida;
- ausência de escrita na fonte canônica;
- `mutationAllowed: false`.

## Testes

Comando local:

```text
node --test
```

Resultado:

- testes: 9;
- aprovados: 9;
- falhas: 0;
- cancelados: 0;
- ignorados: 0.

Cobertura comportamental:

1. estabilidade da serialização canônica;
2. mesmo commit e conteúdo geram o mesmo checksum;
3. mudança semântica altera o checksum;
4. checksum de fonte inválido é rejeitado;
5. IDs duplicados são rejeitados;
6. referências a commits mistos são rejeitadas;
7. reconciliação identifica projeções divergentes;
8. publicação valida antes de ativar;
9. falha de validação não ativa;
10. núcleo declara comportamento somente leitura.

## Limites atuais

Ainda não foram implementados:

- parser Markdown do modelo documental;
- adaptador Git de leitura;
- armazenamento derivado;
- transporte HTTP da API;
- autenticação;
- workflow específico;
- release;
- deploy.

## Próximo passo exclusivo

Após promoção e CI:

1. adicionar adaptador de leitura por commit, somente leitura;
2. definir fixtures reais derivadas dos documentos do Portal;
3. criar parser estrutural sem escrita no Git;
4. integrar a futura API de leitura por contrato;
5. manter publicação e armazenamento como adaptadores externos ao núcleo puro.

## Segurança

Nenhum merge, release, deploy, publicação em produção, force push ou alteração de domínio comercial foi realizado.
