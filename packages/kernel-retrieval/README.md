# @apidevelopers/kernel-retrieval

Camada de **busca federada read-only** para a Plataforma API Developers.digital.

## Papel

O pacote normaliza consultas a múltiplos sistemas de origem sem transformar a
Plataforma em uma cópia indiscriminada desses sistemas.

Princípios:

- isolamento obrigatório por `tenantId`;
- escopo explícito por domínio (`corporate`, `institutional`, `legal`, `medical`);
- conectores autorizados e identificados;
- proveniência por resultado;
- retorno minimizado;
- nenhuma mutação em provedores;
- nenhum envio de mensagem;
- nenhuma alteração de arquivo;
- nenhuma gravação automática em prontuário;
- nenhum conteúdo clínico bruto no gate genérico.

## Fontes previstas

A federação foi desenhada para receber adaptadores governados de:

- e-mail (IMAP/Gmail);
- Google Drive e storages documentais;
- agenda/calendário;
- WhatsApp (WATI/Meta);
- GitHub;
- Peterle/Mitra e fontes jurídicas;
- imuni./EHR e fontes clínicas;
- `kernel-memory` e `kernel-evidence`.

Os sistemas de origem permanecem a fonte primária dos objetos operacionais.
`kernel-memory` registra continuidade institucional; não substitui os provedores.

## Gate médico

Consultas ao domínio `medical` exigem:

- `medicalContext.subjectId` opaco;
- `medicalContext.purposeOfUse` explícito;
- minimização de resultados no agregador genérico;
- título seguro (`safeLabel`) em vez de identificação clínica;
- remoção de snippet e URI na saída federada.

A recuperação de conteúdo clínico completo é uma frente posterior e deve ser
vinculada a autenticação, autorização, auditoria e política de acesso.

## Contrato de conector

```js
{
  id: "mail-primary",
  type: "email",
  domains: ["corporate"],
  async search(request) {
    return [];
  }
}
```

A resposta bruta do conector é normalizada. Campos desconhecidos não atravessam
o limite do kernel.

## Verificação

```bash
npm run check
```

Marcador esperado:

```text
KERNEL_RETRIEVAL_GATE_OK
```
