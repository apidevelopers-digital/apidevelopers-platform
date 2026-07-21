# Commercial Journey Memory Runtime

Runtime estritamente em memória para validar a jornada comercial completa da plataforma:

1. cadastro e verificação do usuário;
2. seleção de produto e plano vendáveis;
3. criação e confirmação fail-closed do checkout;
4. ativação da assinatura;
5. provisionamento ordenado de tenant e projeto;
6. emissão de registro público de API key;
7. primeira requisição autorizada pelo gateway.

## Segurança

- desativado por padrão;
- sem deploy, live ou publicação externa;
- não persiste nem retorna chave bruta ou hash;
- usa apenas repositórios em memória;
- pagamento divergente interrompe a jornada antes do provisionamento.

## Validação

```bash
npm install --ignore-scripts --no-audit --no-fund --no-package-lock
npm run check --workspace=@apidevelopers/commercial-journey-memory-runtime
```
