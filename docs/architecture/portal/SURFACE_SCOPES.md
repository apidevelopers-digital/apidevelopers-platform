# Escopos das Superfícies do Ecossistema

**Status:** proposta modular de interface  
**Escopo:** definição de públicos, domínios e limites de cada superfície  
**Não altera:** papéis institucionais, políticas de acesso ou contratos canônicos

## 1. Modelo de escopo

Cada superfície deve declarar:

```text
surfaceId
displayName
audience
domains[]
capabilities[]
authorityModel
projectionSet
navigationModel
evidencePolicy
brandingContext
```

A composição visual não concede capacidade operacional.

## 2. Portal do uni. Operador

**Público:** operador autorizado do ecossistema  
**Natureza:** transversal  
**Objetivo:** observar, investigar, preparar, aprovar quando autorizado, executar por integrações e verificar resultados

Capacidades possíveis:

- visão consolidada;
- filas operacionais;
- investigação de divergências;
- preparação de ações;
- solicitação e registro de aprovação;
- execução sensível governada;
- reconciliação;
- auditoria e evidências.

A lista efetiva depende do perfil e do estado das integrações.

## 3. API Developers Portal

**Público:** desenvolvedores, integradores e administradores autorizados  
**Natureza:** produto técnico especializado  
**Objetivo:** consumir e administrar recursos da API Developers dentro do escopo permitido

Exemplos de superfícies:

- documentação;
- credenciais protegidas;
- aplicações;
- consumo e limites;
- webhooks;
- ambientes;
- logs e eventos;
- onboarding técnico.

Não herda automaticamente clientes, financeiro, mídias ou infraestrutura institucional.

## 4. Portal institucional da uni.

**Público:** gestão e operação institucional autorizadas  
**Natureza:** administrativa e estratégica  
**Objetivo:** acompanhar organização, clientes, contratos, operação e indicadores institucionais

Pode incluir:

- carteira de clientes;
- visão financeira;
- contratos;
- campanhas;
- operação de mídia;
- status de serviços;
- relatórios institucionais.

Não substitui o `uni. Operador` quando houver execução transversal ou investigação técnica detalhada.

## 5. Portal do cliente

**Público:** cliente e usuários convidados  
**Natureza:** externa e restrita ao relacionamento  
**Objetivo:** acompanhar serviços, campanhas, entregas, relatórios e pendências próprias

Pode incluir:

- campanhas e mídias;
- aprovações do cliente;
- relatórios;
- arquivos;
- faturas e recebíveis permitidos;
- chamados;
- status de serviços.

Nunca expõe dados de outros clientes, infraestrutura interna ou segredos operacionais.

## 6. Portal de mídia e telões

**Público:** equipe de mídia, operadores autorizados e clientes quando aplicável  
**Natureza:** operacional especializada  
**Objetivo:** organizar ativos, campanhas, programação, players e evidências de publicação

Pode incluir:

- catálogo de mídias;
- campanhas;
- filas de processamento;
- pacotes VNNOX;
- status de telões;
- logs de reprodução;
- aprovações e conferências.

Execuções reais seguem confirmações e gates próprios das ferramentas.

## 7. Portal técnico e administrativo

**Público:** equipe técnica ou administrativa autorizada  
**Natureza:** especializada por função  
**Objetivo:** operar infraestrutura, builds, repositórios, ambientes ou rotinas administrativas

Pode incluir:

- GitHub e CI;
- Hostinger e VPS;
- builds;
- observabilidade;
- tarefas internas;
- inventários;
- configurações não sensíveis.

Segredos e credenciais permanecem protegidos fora da projeção visual.

## 8. Reuso seguro

Podem ser compartilhados:

- componentes;
- tokens visuais;
- contratos de estado;
- padrões de feedback;
- modelos de evidência;
- projeções compatíveis;
- mecanismos de navegação.

Não são compartilhados automaticamente:

- permissões;
- autoridade;
- confirmação;
- dados sensíveis;
- escopo de cliente;
- capacidade de execução;
- segredos.

## 9. Critérios de aceitpãão 

- toda superfície declara público e objetivo;
- domínio verítical não implica capacidade de escrita;
- ações dependem de autoridade e gates;
- dados de cliente são isolados;
- o `uni. Operador` permanece transversal;
- superfícies especializadas podem evoluir sem redefinir o núcleo.
