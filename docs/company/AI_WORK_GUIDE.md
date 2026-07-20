# AI WORK GUIDE

**Status:** Canônico  
**Atualizado em:** 2026-07-20  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Público:** inteligências artificiais, colaboradores, operadores e automações

## 1. Propósito

Este documento define como qualquer agente deve trabalhar dentro da empresa sem perder contexto, identidade, método ou continuidade.

Ele não substitui os documentos canônicos de cada área. Ele orienta como encontrá-los, interpretá-los, alterar o sistema com segurança e deixar o trabalho pronto para a próxima janela.

## 2. Ordem obrigatória de entrada

Toda nova janela deve:

1. ler `docs/company/COMPANY_WORLD_INDEX.md`;
2. ler `docs/operating-model/CURRENT_STATE.md`;
3. ler `docs/operating-model/NEXT_ITERATION.md`;
4. identificar a área e o documento canônico correspondente;
5. conferir a branch, o HEAD e a CI;
6. verificar se outra janela está atuando no mesmo domínio;
7. somente então propor ou executar trabalho.

Nenhum agente deve começar reconstruindo contexto apenas pela conversa.

## 3. Identidade operacional da empresa

A empresa trabalha com os seguintes princípios:

- Git é memória institucional e fonte de verdade;
- conversa é sessão de trabalho;
- CI valida;
- Portal lê, governa e opera;
- automações executam dentro de limites explícitos;
- decisões importantes devem terminar registradas;
- documentos canônicos não devem ser duplicados;
- mudanças devem ser pequenas, rastreáveis e reversíveis;
- merge, release, deploy e ações sensíveis exigem autorização explícita.

## 4. Método de produção

O fluxo padrão é:

```text
conferência
→ definição do lote
→ alteração pequena
→ validação local ou estrutural
→ commit temático
→ CI
→ evidência
→ atualização do estado
```

Para domínios técnicos, preferir:

```text
manifesto
→ implementação
→ documentação técnica
→ testes
→ CI segmentada
→ evidência
```

## 5. Microcommits e integridade

- Um commit deve resolver um assunto claro.
- Evitar commits grandes com múltiplos domínios.
- Preferir patch pontual a reescrita integral.
- Validar conteúdo e codificação antes de publicar.
- Em publicação por API, validar Base64 por round-trip.
- Conferir o arquivo após a escrita.
- Nunca declarar sucesso sem evidência do resultado.

Quando um payload falhar por truncamento, tamanho, codificação ou conflito, reduzir o lote e repetir com validação.

## 6. Trabalho em múltiplas janelas

Cada janela deve possuir escopo explícito.

Antes de editar:

1. conferir o HEAD atual;
2. identificar os arquivos sob responsabilidade da janela;
3. evitar editar simultaneamente o mesmo arquivo de outra frente;
4. registrar mudanças em microcommits;
5. atualizar `CURRENT_STATE.md` ou `NEXT_ITERATION.md` quando o estado institucional mudar.

Divisão padrão atual:

### Engenharia

Responsável por:

- manifests;
- código;
- serviços;
- packages;
- scripts;
- testes;
- workflows;
- CI segmentada;
- documentação técnica do domínio.

### Produto, arquitetura e governança

Responsável por:

- índice-mestre;
- continuidade;
- capacidades;
- entidades;
- relações;
- prontidão;
- modelo de dados do Portal;
- critérios de promoção;
- governança de merge, release e deploy.

## 7. Regra contra duplicação

Antes de criar qualquer documento, módulo ou registro:

1. procurar se já existe fonte canônica;
2. conferir o índice-mestre;
3. verificar documentos relacionados;
4. atualizar a fonte existente quando a função for a mesma;
5. criar novo artefato apenas quando houver responsabilidade única.

Quando dois documentos parecerem contraditórios, não criar um terceiro para contornar o conflito. Registrar e resolver a divergência.

## 8. Regra de autoridade

A autoridade segue esta ordem:

1. documento canônico da área;
2. estado mais recente validado no Git;
3. decisão arquitetural registrada;
4. implementação e testes;
5. conversa atual.

A conversa nunca deve sobrescrever silenciosamente uma fonte canônica.

## 9. Regras para o Portal

- O Portal não cria uma segunda fonte de verdade.
- O Portal deve ler registros versionados e estados operacionais.
- A modelagem de entidades e relações vem antes das telas.
- Toda informação exibida deve apontar para origem, estado e evidência.
- Alterações sensíveis feitas pelo Portal devem respeitar aprovação e auditoria.

## 10. Ações sensíveis

Exigem autorização explícita:

- merge;
- release;
- deploy;
- alteração em produção;
- publicação externa;
- mudança de infraestrutura;
- ação destrutiva;
- alteração de segurança;
- execução remota com impacto operacional.

Sem autorização, o agente pode preparar, simular, validar e apresentar a conferência, mas não executar a ação real.

## 11. Encerramento obrigatório de sessão

Toda sessão deve terminar com:

1. o que foi identificado;
2. o que foi alterado;
3. commit ou evidência;
4. estado atual;
5. pendências;
6. bloqueios;
7. próximo passo único;
8. indicação de autorização necessária, quando aplicável.

Mudanças institucionais devem atualizar o índice, o estado atual ou a próxima iteração.

## 12. Critério de qualidade

Um lote está concluído somente quando:

- a responsabilidade está clara;
- não duplica fonte existente;
- o conteúdo está registrado;
- a validação foi executada;
- o commit é rastreável;
- a CI relevante foi conferida;
- o estado e o próximo passo estão claros.

## 13. Regra de continuidade

> Qualquer agente deve conseguir entrar pela raiz, localizar a verdade, entender o estado, executar um lote pequeno e deixar a empresa mais organizada do que encontrou.

## 14. Próxima leitura

Depois deste guia, o agente deve abrir o documento canôninco da área indicada em `NEXT_ITERATION.md` e conferir o HEAD real da branch antes de trabalhar.
