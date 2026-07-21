# uni.Operador — Ponto de Entrada Canônico

**Status:** ATIVO  
**Repositório:** `sitedauni/apidevelopers-platform`  
**Modo atual:** estabilização por ondas  
**Branch de governança:** `operations/uni-operator-entrypoint-20260721`  
**Branch de execução ativa:** `stabilization/wave-1-planning-engine-20260721`  
**Merge:** BLOQUEADO sem aprovação explícita  
**Deploy:** BLOQUEADO sem aprovação explícita  

## Gatilho canônico

> Releia o ponto de entrada canônico e siga.

## Protocolo de início

1. Ler este arquivo.
2. Ler `STATUS_INDEX.md`.
3. Ler `GOVERNANCE.md`.
4. Ler `PLAYBOOK.md`.
5. Abrir apenas os arquivos de status das frentes ativas.
6. Conferir branches, HEADs, commits, PRs e workflows no GitHub.
7. Executar somente a próxima ação autorizada.
8. Registrar qualquer mudança relevante no Git antes de encerrar.

## Fonte de verdade

O Git é a memória institucional. Conversas são operadores temporÁrios.

Nenhuma decisão, bloqueio, resultado de teste, próximo passo ou mudança de estado pode existir apenas em uma conversa.

## Estado operacional atual

- A mega-branch `foundation/global-platform-bootstrap-20260715` permanece congelada.
- O PR principal continua fora do fluxo de merge até nova decisão.
- A estabilização ocorre por ondas pequenas e revisáveis.
- A Onda 1 é dedicada ao Planning Engine.
- Uma única frente pode escrever em cada branch.
- Frentes de auditoria e validação operam em branches próprias.

## Documentos obrigatórios

- `docs/operations/STATUS_INDEX.md`
- `docs/operations/GOVERNANCE.md`
- `docs/operations/PLAYBOOK.md`
- `docs/operations/status/`
- `docs/operations/decisions/`
- `docs/operations/waves/`

## Ações bloqueadas por padrão 

- merge em `main`;
- deploy;
- exclusão destrutiva;
- alteração de segredo ou credencial;
- expansão de escopo;
- escrita concorrente na mesma branch;
- mudança arquitetural sem decisão registrada.

## Próxima ação autorizada

Consolidar a camada operacional canônica e, depois, acompanhar a execução da Onda 1 por meio dos arquivos de status e dos commits das branches correspondentes.

## Encerramento obrigatório

Antes de encerrar uma sessão 

1. registrar o estado;
2. fazer commit;
3. atualizar oSHA no arquivo de status;
4. declarar oópróximo passo;
5. marcar a frente como `BLOCKED`, `READY_FOR_REVIEW`, `READY_FOR_VALIDATION`, `APPROVED` ou `CLOSED`.
