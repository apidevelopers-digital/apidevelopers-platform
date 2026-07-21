# Onda 1 de Estabilização — Planning Engine

**Data:** 2026-07-21  
**Branch alvo:** `stabilization/wave-1-planning-engine-20260721`  
**Base:** `main` em `e5aef84f36d00dfae694911f44be9f7f6edcaf79`  
**Fonte controlada:** `foundation/global-platform-bootstrap-20260715` em `ea066ac5da9050c9b5010b23d88bef3df509ed8b`  
**Estado:** autorizado para preparação e implementação mínima  
**Merge e deploy:** bloqueados

## Objetivo

Extrair da foundation somente a migração do Planning Engine para um pacote canônico, preservando compatibilidade com o caminho legado e sem transportar qualquer outro domínio.

## Escopo permitido

- `packages/kernel-planning/README.md`
- `packages/kernel-planning/package.json`
- `packages/kernel-planning/src/index.mjs`
- `packages/kernel-planning/src/governed.mjs`
- `packages/kernel-planning/test/index.test.mjs`
- `packages/kernel-planning/test/legacy-compatibility.test.mjs`
- `scripts/lib/planning-engine.mjs`
- ajustes mínimos em manifesto/workspace estritamente necessários para executar o pacote e seus testes
- um workflow específico do Planning Engine, somente se indispensável e isolado
- documentação desta onda

## Fora de escopo

- Portal
- runtime comercial
- mídia
- observabilidade
- VNNOX
- WhatsApp
- financeiro
- autenticação
- banco de dados
- deploy
- mudanças genéricas de CI
- refatorações não exigidas pela migração
- arquivos fora da lista permitida sem aprovação da Torre

## Regra arquitetural

A implementação canônica deve residir em `packages/kernel-planning/src/index.mjs`.

O arquivo `scripts/lib/planning-engine.mjs` deve funcionar somente como camada de compatibilidade, reexportando a API canônica sem duplicar a lógica.

A migração não pode quebrar consumidores existentes do caminho legado.

## Sequência obrigatória
1. Confirmar que a branch alvo começa exatamente na base registrada.
2. Comparar os arquivos permitidos entre a `main` e a `foundation`.
3. Identificar dependências externas antes de copiar qualquer arquivo.
4. Portar o pacote em microcommit único ou em no máximo três microcommits coerentes:
   - pacote canônico;
   - compatibilidade e testes;
   - CI/documentação, se necessária.
5. Executar os testes do pacote.
6. Executar os teste de compatibilidade do caminho legado.
7. Executar os checks globais que já existirem e forem aplicáveis.
8. Conferir `git diff --name-only` e provar que nenhum domínio proibido entrou.
9. Parar antes de abrir PR, fazer merge ou deploy.
10. Entregar relatório à Torre.

## Critérios de aceite
- testes do pacote aprovados;
- teste de compatibilidade legado aprovado;
- nenhuma duplicação da implementação;
- nenhuma alteração fora do escopo sem justificativa e autorização;
- branch baseada na `main`, sem merge da mega-branch;
- histórico pequeno e revisável;
- evidências com comandos, resultados e SHAs;
- nenhuma ação destrutiva;
- nenhum merge;
- nenhum deploy.

## Condições de parada imediata
Parar e reportar se:

- surgir dependência de outro domínio;
- houver necessidade de alterar mais de 12 arquivos;
- algum teste global falhar por causa da onda;
- o caminho legado expuser API diferente;
- houver segredo, credencial ou configuração sensível;
- a branch alvo não estiver na base registrada;
- outro executor produzir commits concorrentes.

## Formato do relatório
- HEAD inicial e final;
- commits criados;
- arquivos alterados;
- testes executados e resultados;
- divergências encontradas;
- riscos residuais;
- recomendação: pronto para revisão ou bloqueado.

## Governança
Somente uma janela pode escrever nesta branch. As demais janelas devem trabalhar em leitura e produzir auditoria, revisão ou conferência. A Torre de Comando autoriza qualquer ampliação de escopo.
