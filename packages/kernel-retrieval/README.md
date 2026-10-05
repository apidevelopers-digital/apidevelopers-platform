# @apidevelopers/kernel-retrieval

Camada de busca federada governada para a Plataforma API Developers.digital.

## Papel

O pacote consulta múltiplos sistemas de origem sem transformar a Plataforma em uma cópia indiscriminada desses sistemas. Os provedores continuam sendo a fonte primária dos objetos operacionais.

Princípios:

- isolamento obrigatório por `tenantId`;
- escopo explícito por domínio (`corporate`, `institutional`, `legal`, `medical`);
- conectores autorizados e identificados;
- proveniência por resultado;
- retorno minimizado;
- nenhuma mutação em provedores;
- nenhuma escrita automática em prontuário;
- nenhuma mensagem enviada pela camada de retrieval.

## Gates implementados

### R1 — contrato federado
Kernel read-only, isolamento de tenant, domínios, proveniência, minimização e testes.

### R2 — adaptadores corporativos
E-mail Peterle, WhatsApp UNICO/Zuni, document-store/Drive e calendário.

Os adaptadores retornam somente metadados governados. Corpo de mensagem, bytes de arquivo, participantes privados e identificadores brutos não atravessam o agregador genérico.

### R3 — Peterle/Mitra
Leitura jurídica read-only de diretório de clientes e assuntos/processos, com IDs opacos e sem corpo de documentos.

### R4 — imuni./EHR
Busca clínica exige `medicalContext.subjectId` opaco e `medicalContext.purposeOfUse`.

A federação genérica não retorna nome do paciente, texto clínico livre, URI do prontuário, anexos ou identificadores brutos.

### R5 — conteúdo completo governado
`createGovernedContentGate` / `createGovernedContentGateV2` permite fetch pontual somente quando todos os gates forem satisfeitos:

1. tenant, fonte, objeto e finalidade exatos;
2. aprovação humana ainda válida e vinculada ao objeto;
3. autorização explícita;
4. decisão de política `allow`;
5. auditoria disponível antes do fetch;
6. provedor read-only;
7. limite máximo de conteúdo;
8. redação obrigatória para domínios `legal` e `medical`;
9. anexos expostos somente como metadados + digest;
10. auditoria final com digest, tamanho, contagem de redações e anexos, sem registrar o conteúdo.

R5 é deny-by-default e falha fechada quando autorização, política, auditoria ou redação não satisfazem o contrato.

## Conectores

- `createPeterleMailConnector`
- `createUnicoWhatsAppConnector`
- `createDocumentStoreConnector`
- `createCalendarConnector`
- `createPeterleMitraConnector`
- `createImuniEhrConnector`

Os sistemas de origem permanecem autoridade. `kernel-memory` registra continuidade institucional; não substitui os provedores.

## Verificação

```bash
npm run check
```

O CI do pacote roda no runner institucional:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

## Estado

R1–R5 estão implementados na branch de trabalho do PR #689. Isso não significa merge, deploy ou ativação em produção. Essas ações permanecem bloqueadas até aprovação explícita.
