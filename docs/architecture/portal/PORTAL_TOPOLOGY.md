# Topologia de Portais do Ecossistema

**Status:** proposta modular de arquitetura de interface  
**Escopo:** relação entre o `uni. Operador` e as superfícies especializadas  
**Não altera:** governança, autoridade, contratos canônicos ou fontes de verdade

## 1. Princípio

O `uni. Operador` é a superfície operacional transversal do ecossistema.

Ele não pertence exclusivamente à API Developers, ao site, ao financeiro, aos clientes ou à mídia. Ele coordena a leitura, preparação, aprovação, execução e verificação entre esses domínios conforme permissões, gates e integrações disponíveis.

Os demais portais são superfícies especializadas, voltadas a produtos, públicos ou contextos operacionais determinados.

## 2. Topologia conceitual

```text
Núcleo operacional e integrações compartilhadas
├── Portal do uni. Operador
├── API Developers Portal
├── Portal institucional da uni.
├── Portais dos clientes
├── Portal de mídia e telões
└── Portais técnicos e administrativos
```

A topologia não exige que cada portal seja um sistema isolado. Diferentes superfícies podem reutilizar projeções, contratos, componentes, autenticação e serviços comuns.

## 3. Superfície total

O Portal do `uni. Operador` pode projetar múltiplos domínios:

- APIs e integrações;
- site e conteúdos;
- clientes;
- financeiro;
- campanhas e mídias;
- WhatsApp e Meta;
- telões e VNNOX;
- GitHub;
- Hostinger;
- builds e infraestrutura;
- tarefas internas;
- auditoria e evidências.

A disponibilidade de um domínio depende da integração, permissão, gate e evidência aplicáveis.

## 4. Superfícies especializadas

Uma superfície especializada:

- possui público e objetivo determinados;
- expõe somente os domínios necessários;
- aplica escopo e permissões próprios;
- reutiliza contratos comuns quando compatível;
- não cria autoridade implícita;
- não presume acesso ao conjunto completo do ecossistema.

## 5. Relação entre superfícies

```text
fonte canônica
  → projeção de domínio
  → política de acesso
  → composição da superfície
  → ação assistida
  → evidência posterior
```

A mesma projeção pode alimentar mais de uma superfície, desde que:

- o contrato permaneça compatível;
- os campos protegidos sejam filtrados;
- o contexto e a temporalidade permaneçam visíveis;
- ações respeitem autoridade e gates;
- resultados sejam auditáveis.

## 6. Separação de responsabilidades

| Camada | Responsabilidade |
|---|---|
| Núcleo | contratos, integrações, políticas e auditoria |
| Projeções | modelos de leitura derivados e reconciliáveis |
| Portal do uni. Operador | operação transversal e visão total permitida |
| Portal especializado | experiência focada em produto, público ou domínio |
| Ferramenta externa | execução efetiva quando autorizada |
| Evidência | confirmação verificável do resultado |

## 7. Limites

O Portal do `uni. Operador` não executa por presença visual de um botão. Toda execução depende de:

- ferramenta ou integração disponível;
- escopo válido;
- autoridade adequada;
- gate satisfeito;
- parâmetros válidos;
- confirmação exigida;
- evidência posterior quando aplicável.

## 8. Critérios de aceitação

- o `uni. Operador` é descrito como superfície transversal;
- a API Developers é tratada como um domínio ou produto, não como proprietária exclusiva do Portal;
- portais especializados possuem escopo próprio;
- componentes e projeções podem ser compartilhados sem compartilhar autoridade;
- nenhuma superfície especializada recebe acesso total por herança;
- execução, aceitação e verificação permanecem estados distintos.
