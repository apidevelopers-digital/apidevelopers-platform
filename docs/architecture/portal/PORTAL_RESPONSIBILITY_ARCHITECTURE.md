# Arquitetura de Responsabilidades dos Portais

**Status:** proposta modular de arquitetura  
**Escopo:** separação entre ChatGPT, Git, serviços, portais especializados e `uni. Operador`  
**Não altera:** governança, autoridade, gates ou políticas institucionais

## 1. Objetivo

Definir responsabilidades claras para evitar que uma superfície visual, um chat ou um repositório seja tratado como executor, cofre de segredos ou fonte operacional única.

## 2. Camadas

| Camada | Responsabilidade |
|---|---|
| ChatGPT | especificar, desenvolver, revisar e coordenar trabalho assistido |
| Git/GitHub | versionar código, documentação, histórico e automações |
| Serviços e APIs | aplicar regras, validar escopos e executar operações reais |
| Cofre de segredos | armazenar chaves, tokens e credenciais sensíveis |
| Portais especializados | administrar produtos, clientes, acessos e operações por público |
| Portal do `uni. Operador` | operar transversalmente domínios autorizados |
| Auditoria | registrar decisões, solicitações, execuções e evidências |

## 3. Regra de autoridade

Nenhuma camada recebe autoridade por estar acima ou abaixo no diagrama.

Autoridade depende de:

- identidade autenticada;
- escopo válido;
- papel autorizado;
- gate satisfeito;
- confirmação exigida;
- política institucional aplicável.

## 4. Portal do `uni. Operador`

O Portal do `uni. Operador` pode:

- consultar múltiplos domínios;
- investigar divergências;
- preparar ações;
- solicitar aprovações;
- executar por integrações autorizadas;
- verificar resultados;
- reunir evidências e auditoria.

Ele não:

- cria autoridade;
- ignora gates;
- armazena segredos em texto aberto;
- substitui os serviços de origem;
- presume sucesso sem evidência.

## 5. Portais especializados

Cada portal especializado deve declarar:

- público;
- produto ou domínio;
- capacidades;
- dados visíveis;
- ações permitidas;
- autoridade necessária;
- política de evidência;
- isolamento de tenant.

Exemplos:

- API Developers Portal;
- Portal institucional da `uni.`;
- Portal do cliente;
- Portal de mídia e telões;
- Portal técnico e administrativo.

## 6. Compartilhamento seguro

Podem ser compartilhados:

- componentes;
- contratos de estado;
- tokens semânticos;
- modelos de evidência;
- padrões de acessibilidade;
- mecanismos de autenticação compatíveis.

Não são compartilhados automaticamente:

- permissões;
- escopos;
- dados de clientes;
- credenciais;
- capacidade de escrita;
- autoridade operacional.

## 7. Fluxo de execução

```text
usuário autenticado
→ portal
→ política e gate
→ serviço ou integração
→ execução
→ evidência posterior
→ auditoria
→ projeção atualizada
```

## 8. Critérios de aceitação

- cada camada possui responsabilidade documentada;
- portais nao armazenam segredos em texto aberto;
- execução real ocorre somente em serviços autorizados;
- o `uni. Operador` permanece transversal;
- portais especializados permanecem restritos ao próprio escopo;
- sucesso operacional exige evidência posterior;
- dados de clientes permanecem isolados.
