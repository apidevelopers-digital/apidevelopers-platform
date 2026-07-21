# Contrato do Painel de Evidência do Portal

**Status:** proposta modular de componente  
**Escopo:** origem, validade, temporalidade, confiança e correlação de evidências  
**Não altera:** fonte de verdade ou decisão institucional

## 1. Propriedades

```text
evidenceId
type
sourceRef
revision
capturedAt
validUntil
state
confidence
correlationId
relatedObjects[]
summary
```

## 2. Estados

- valid;
- missing;
- expired;
- conflicting;
- unverifiable;
- partial;
- unavailable.

## 3. Conteúdo mínimo

- tipo;
- origem;
- identificador;
- revisão ou hash;
- instante;
- validade;
- confiança;
- objetos correlacionados;
- limitações conhecidas.

## 4. Regras

- ausência permanece visível;
- payloads sensíveis não são exibidos;
- conflito não escolhe automaticamente um lado;
- evidência posterior é distinguida de solicitação aceita;
- links de origem respeitam permissão;
- datas relativas oferecem data absoluta.

## 5. Acessibilidade

O painel tem ordem linear, rótulos claros, estados textuais e navegação por teclado.

## 6. Critérios de aceitação

- toda afirmação verificável aponta para uma origem;
- sucesso operacional exige evidência válida;
- expiração e conflito são explícitos;
- correlação pode ser copiada sem expor segredo.
