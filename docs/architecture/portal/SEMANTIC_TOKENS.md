# Tokens Semânticos do Portal

**Status:** proposta modular de design  
**Escopo:** significados visuais reaplicéveis em telas, componentes e estados  
**Não altera:** governança, estados canônicos, autoridade ou gates

## 1. Princípio

Tokens senânticos devem representar significado operacional, nao cor fixa ou tecnologia de implementação.

Cada token declara:

- propósito;
- contexto de uso;
- estados associados;
- contraste esperado;
- alternativa textual;
- comportamento em modo escuro ou claro.

## 2. Famílias de tokens

| Família | Uso |
|---|---|
| background | superfícies e camadas |
| surface | cartões, painéis e tabelas |
| border | separação, foco e delimitação |
| text | hierarquia tipográfica e legibilidade |
| icon | ícones informativos e operacionais |
| focus | navegação por teclado |
| evidence | origem, confiança e validade |
| gate | satisfeito, pendente, falho e não avaliado |
| risk | informativo, atenção, bloqueio, erro e crítico |
| action | leitura, preparação, aprovação e execução |

## 3. Tokens de estado

| Token senântico | Significado |
|---|---|
| `state.healthy` | estado confirmado por evidência válida |
| `state.attention` | dado parcial, atrasado ou incompleto |
| `state.blocked` | gate obrigatório não satisfeito |
| `state.error` | falha confirmada |
| `state.unknown` | evidência insuficiente |
| `state.divergent` | fonte projetada e fonte real não reconciliadas |
| `state.stale` | projeção antiga demais para ação sensível |
| `state.partial` | datos úteis, com limitações visíveis |

## 4. Tokens de ação

| Token | Uso |
|---|---|
| `action.read` | navegação, consulta e exportação |
| `action.prepare` | rascunho, dry-run e comparação |
| `action.approve` | solicitação e decisão |
| `action.execute` | ação sensível autorizada |
| `action.destructive` | deleção, reversão ou impacto alto |

## 5. Tokens de evidência

| Token | Uso |
|---|---|
| `evidence.valid` | evidência verificada e temporalmente válida |
| `evidence.missing` | ausência de evidência obrigatória |
| `evidence.expired` | evidência fora da validade |
| `evidence.conflicting` | evidências incompatíveis |
| `evidence.unverifiable` | origem ou integridade não confirmadas |

## 6. Nomenção

Nomes devem usar hierarquia do geral para o específico:

```text
family.role.variant.state
```

Exemplos:

- `text.primary.default`
- `surface.raised.subtle`
- `border.risk.blocked`
- `icon.evidence.valid`
- `focus.interactive.visible`

## 7. Regras de uso

- cor nunca é o único sinal de um estado;
- texto e cícone acompanham tokens de risco;
- tokens de ação múltipla não confundem leitura com execução;
- tokens de sucesso só usam evidência válida;
- tokens de bloqueio explicam o gate;
- tokens de falha não expõem dados sensíveis.

## 8. Critérios de aceitação

- cada token tem significado descrito;
- o mesmo significado é reaplicével em tema claro e escuro;
- contraste não depende do tom de fundo;
- estados possuem alternativa textual;
- arções sensíveis seguem humanizadas e separadas;
- tokens não alteram estados canônicos.
