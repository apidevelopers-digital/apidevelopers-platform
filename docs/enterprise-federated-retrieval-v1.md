# Enterprise Federated Retrieval v1

**Status:** R1–R5 implementados na branch de trabalho do PR #689.  
**Produção:** não ativada; sem merge e sem deploy.

## 1. Objetivo

Permitir que a ADA pesquise múltiplas fontes autorizadas e apresente resultados verificáveis com proveniência, sem centralizar indiscriminadamente dados corporativos, jurídicos ou clínicos.

## 2. Princípios

1. `tenantId` obrigatório e isolamento entre tenants.
2. domínio explícito: `corporate`, `institutional`, `legal` ou `medical`.
3. somente conectores autorizados.
4. sistema de origem permanece fonte de verdade.
5. metadados e proveniência normalizados.
6. retrieval genérico read-only.
7. conteúdo sensível separado de metadados de busca.
8. conteúdo integral somente por gate R5 governado.
9. domínio médico com requisitos adicionais e minimização.
10. nenhuma mutação é consequência automática de uma busca.

## 3. Matriz de fontes

| Fonte | Tipo | Domínio principal | Regra |
|---|---|---|---|
| E-mail Peterle | `email` | corporate/legal | cabeçalhos e metadados no R2; corpo somente via R5 |
| Document store / Drive | `file` | corporate/legal/institutional | metadados no R2; bytes/conteúdo somente via R5 |
| Calendário | `calendar` | corporate/legal | agenda minimizada, sem participantes/links privados no agregador |
| WhatsApp UNICO/Zuni | `message` | corporate/legal | metadados minimizados; sem corpo/telefone/nome no agregador |
| GitHub | `file/other` | institutional | evidência técnica e código como fonte de verdade |
| Peterle/Mitra | `legal_case` | legal | clientes/assuntos com IDs opacos e sem corpo de documentos |
| imuni./EHR | `medical_record` | medical | metadados clínicos mínimos com `subjectId` + `purposeOfUse` |
| kernel-memory/evidence | `institutional_memory` | institutional | continuidade e evidência, não substituem provedores |

## 4. Gates

### R1 — contrato federado
Isolamento, domínios, proveniência, minimização, filtros de fonte e testes.

### R2 — adaptadores corporativos
E-mail, document store/Drive, calendário e WhatsApp.

### R3 — jurídico
Peterle/Mitra read-only, IDs opacos e conteúdo documental fora do agregador.

### R4 — médico
`medicalContext.subjectId` opaco + `medicalContext.purposeOfUse` obrigatórios. O agregador não retorna nome do paciente, texto clínico livre, URI, anexos nem identificadores brutos.

### R5 — conteúdo completo governado
Fetch pontual de corpo/anexo/documento somente após:

- aprovação humana vinculada a tenant, fonte, objeto e finalidade;
- autorização explícita;
- decisão de política `allow`;
- auditoria disponível antes do fetch;
- provedor read-only;
- limite de tamanho;
- redação obrigatória em `legal` e `medical`;
- anexos reduzidos a metadados + digest no retorno genérico;
- auditoria final sem conteúdo bruto.

O R5 é deny-by-default e fail-closed.

## 5. Relação com kernels existentes

- `kernel-memory`: continuidade institucional append-only.
- `kernel-evidence`: integridade e proveniência de evidências.
- `auth-core`: identidade/autenticação para gates de runtime.
- `kernel-policy`: decisões de política.
- `kernel-audit`: trilha de acesso governado.

A integração com esses kernels deve ocorrer por contratos explícitos; retrieval não os substitui.

## 6. Fora do escopo desta entrega

- merge;
- deploy;
- envio de e-mail ou WhatsApp;
- escrita em Drive/calendário;
- mutação de processo;
- gravação de prontuário;
- publicação;
- armazenamento central de segredos;
- índice clínico bruto compartilhado.

## 7. Verificação

O pacote usa o runner institucional:

```yaml
runs-on:
  - self-hosted
  - macOS
  - X64
```

No head `a373a365c2afa9b19c3ace3c53913420e1113228`, `Kernel Retrieval CI` e `Platform Baseline CI` foram aprovados. Qualquer commit posterior exige nova confirmação dos CIs antes de revisão de merge.
