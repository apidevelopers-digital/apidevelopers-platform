# @apidevelopers/kernel-evidence

Registro de evidências determinístico, vinculado a tenant e ciclo, resistente a adulteração e append-only para o Kernel da Plataforma API Developers.digital.

## Garantias

- integridade SHA-256 sobre representação canônica;
- isolamento obrigatório por tenant e ciclo;
- cópias defensivas e saída profundamente imutável;
- bloqueio recursivo de campos e valores semelhantes a segredos;
- proveniência explícita e encadeamento por `previousDigest`;
- expiração verificável sem apagar o registro original;
- revogação e supersessão por eventos de ciclo de vida append-only;
- leitura ativa bloqueia evidência expirada, revogada ou supersedida;
- nenhum efeito colateral de provedor, rede ou persistência;
- handoff governado `kernel-runtime -> kernel-evidence -> kernel-audit`.

## API

```js
import {
  createEvidenceRegistry,
  verifyEvidence,
  isEvidenceUsable,
} from "@apidevelopers/kernel-evidence";
```

O registro é em memória por desenho. Adaptadores de persistência permanecem fora do Kernel.

Marcador institucional: `KERNEL_EVIDENCE_GATE_OK`.
