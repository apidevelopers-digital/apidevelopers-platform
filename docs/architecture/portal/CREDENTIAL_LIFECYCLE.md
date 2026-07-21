# Ciclo Seguro de Credenciais e Tokens

**Status:** proposta modular de segurança de produto  
**Escopo:** criação, exibição, uso, rotação, revogação e auditoria de credenciais  
**Não altera:** políticas institucionais, autoridades ou contratos canônicos

## 1. Princípio

Portais podem administrar credenciais, mas o segredo deve ser gerado e protegido pelo backend ou serviço responsável.

Chats, commits, logs públicos e arquivos versionados nunca armazenam segredos.

## 2. Tipos

- API Key;
- access token;
- refresh token;
- webhook secret;
- client secret;
- credencial temporária;
- token de convite;
- token de recuperação;
- chave de integração.

Cada tipo deve declarar finalidade, escopo, validade e política de rotação.

## 3. Modelo mínimo

```text
credentialId
ownerId
tenantId
applicationId
environment
type
scopes[]
status
createdAt
expiresAt
lastUsedAt
rotatedAt
revokedAt
secretFingerprint
createdBy
revokedBy
```

O valor secreto completo não faz parte do modelo consultável após a criação.

## 4. Criação

```text
solicitação
→ autenticação
→ autorização
→ validação de escopos
→ confirmação proporcional ao risco
→ geração segura no backend
→ armazenamento protegido
→ exibição única do segredo
→ auditoria
```

A interface deve informar que o segredo não poderá ser visualizado novamente.

## 5. Exibição única

Na criação:

- o segredo pode ser exibido uma única vez;
- cópia exige ação explícita;
- a tela não registra o segredo em analytics;
- screenshots e logs não são gerados automaticamente;
- após sair da tela, apenas identificador e fingerprint permanecem visíveis.

## 6. Estados

- active;
- expiring;
- expired;
- rotation-pending;
- revoked;
- compromised;
- disabled;
- unknown.

`active` não significa que a credencial foi usada com sucesso.

## 7. Rotação

A rotação deve:

1. gerar nova credencial;
2. preservar a anterior por janela controlada quando permitido;
3. informar dependências;
4. registrar quem iniciou;
5. permitir validação;
6. revogar a anterior;
7. produzir evidência posterior.

## 8. Revogação

A revogação exige:

- identificação da credencial;
- escopo e proprietário;
- impacto estimado;
- confirmação;
- motivo;
- auditoria;
- verificação posterior.

Revogação não deve depender apenas da remoção visual no portal.

## 9. Permissões

Separar capacidades:

- listar credenciais;
- ver metadados;
- criar;
- rotacionar;
- revogar;
- alterar escopos;
- consultar uso;
- administrar credenciais de outro usuário ou tenant.

Nenhuma capacidade é herdada apenas por acesso ao portal.

## 10. Logs e auditoria

Registrar:

- evento;
- ator;
- tenant;
- credencial por identificador seguro;
- instante;
- origem;
- escopo;
- resultado;
- correlação;
- evidência.

Nunca registrar o segredo completo.

## 11. Incidente

Quando houver suspeita de comprometimento:

```text
marcar como compromised
→ bloquear uso quando suportado
→ rotacionar ou revogar
→ identificar dependências
→ verificar acessos recentes
→ registrar incidente
→ confirmar resultado
```

## 12. Critérios de aceitação

- segredos não aparecem em Git ou chats;
- criação possui exibição única;
- armazenamento usa mecanismo protegido;
- rotação e revogação são auditáveis;
- escopos são explícitos;
- tenants permanecem isolados;
- o portal mostra metadados, não o segredo;
- toda operação sensível exige confirmação e evidência.
