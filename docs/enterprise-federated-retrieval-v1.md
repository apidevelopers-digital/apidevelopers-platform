# Enterprise Federated Retrieval v1

**Status:** fundação em branch de trabalho  
**Objetivo:** permitir que a ADA pesquise múltiplas fontes autorizadas e apresente
um resultado unificado, verificável e com proveniência, sem centralizar
indiscriminadamente dados de escritório, empresa ou saúde.

## 1. Princípio arquitetural

A federação deve:

1. exigir `tenantId` explícito;
2. exigir domínio de consulta explícito;
3. consultar apenas conectores autorizados;
4. manter o provedor original como fonte de verdade;
5. normalizar metadados e proveniência;
6. bloquear mutações na camada de retrieval;
7. separar conteúdo sensível de metadados de busca;
8. auditar gates que futuramente liberarem conteúdo completo.

## 2. Domínios

- `corporate` — rotinas administrativas e empresariais;
- `institutional` — GitHub, memória, evidências e governança;
- `legal` — Peterle/Mitra, processos, documentos e fontes jurídicas;
- `medical` — imuni./EHR e dados de cuidado, com política mais restritiva.

Uma consulta pode atravessar mais de um domínio somente quando o contexto de
autorização permitir. A presença do domínio `medical` ativa requisitos
adicionais.

## 3. Matriz de fontes

| Fonte | Tipo | Domínio principal | Regra inicial |
|---|---|---|---|
| E-mail | email | corporate/legal | cabeçalhos e snippets seguros |
| Google Drive / storage | file | corporate/legal | metadados e trechos permitidos |
| Calendário | calendar | corporate | agenda autorizada |
| WhatsApp WATI/Meta | message | corporate/legal | mensagens autorizadas e minimizadas |
| GitHub | file/other | institutional | repositórios e evidências técnicas |
| Peterle/Mitra | legal_case/file | legal | leitura assistida, revisão humana |
| imuni./EHR | medical_record | medical | metadados restritos no gate genérico |
| kernel-memory/evidence | institutional_memory | institutional | continuidade e prova institucional |

## 4. Separação médica

Dados clínicos não devem compartilhar um índice bruto com dados corporativos.

No gate v0.1:

- a busca médica exige `subjectId` opaco;
- exige `purposeOfUse`;
- a federação genérica devolve apenas rótulo seguro, proveniência e metadados
  mínimos;
- snippets clínicos e URI do registro não atravessam o agregador;
- não há escrita automática em prontuário;
- conteúdo completo depende de gate posterior com autorização e auditoria.

Isso preserva a possibilidade de um assistente de escritório médico sem
transformar a busca corporativa em repositório de dados clínicos.

## 5. Relação com kernels existentes

- `kernel-memory`: continuidade append-only, não provedor universal de dados;
- `kernel-evidence`: integridade e proveniência de evidências;
- `auth-core`: deverá fornecer identidade e escopos para gates posteriores;
- `kernel-audit`: deverá registrar acesso governado;
- `kernel-policy`: deverá materializar políticas de acesso por domínio.

## 6. Gates de implementação

### R1 — contrato federado
Kernel read-only, isolamento de tenant, domínios, proveniência, minimização e
testes.

### R2 — adaptadores corporativos
E-mail, Drive/storage, calendário e WhatsApp.

### R3 — adaptadores jurídicos
Peterle/Mitra, documentos e processos.

### R4 — adaptadores clínicos
imuni./EHR com identidade do paciente, finalidade de uso e auditoria.

### R5 — conteúdo completo governado
Fetch pontual de corpo/anexo/documento com autorização explícita, política,
auditoria e redaction.

## 7. Fora de escopo desta fundação

- deploy;
- envio de e-mail ou WhatsApp;
- alteração de calendário;
- escrita em Drive;
- mutação de processo;
- gravação de prontuário;
- publicação;
- centralização de segredos;
- indexação clínica bruta.

A camada de retrieval é deliberadamente **read-only**.
