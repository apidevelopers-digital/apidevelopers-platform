# Zuni Master + uni.co — Reancoragem 2026-08-12

> Decisão de produto: a partir de 2026-08-12, o Zuni Master é reconstruído para frente, sem depender de produtos, roadmaps ou ideias anteriores para definir seu escopo.

## 1. Definição canônica

- Nome do plano: **Zuni Master**
- Composição: **Zuni + uni.co**
- Preço de lançamento: **R$ 1.690/mês**
- Cobrança anual: **não definida nesta reancoragem**
- Natureza: plano premium de operação multicanal com inteligência institucional integrada.

## 2. Proposta de valor

O Zuni Master não é apenas uma versão maior do Zuni. Ele combina a operação multicanal do Zuni com a inteligência do uni.co para transformar o atendimento em uma operação assistida por IA, mantendo governança humana e rastreabilidade.

O Zuni continua sendo a superfície operacional de WhatsApp, conversas, contatos, canais, templates, status e atendimento. O uni.co entra como camada cognitiva, oferecendo contexto, geração, análise e ação assistida.

## 3. Capacidades do Master

O Master deve evoluir para suportar, de forma explícita e auditável:

1. **Respostas assistidas**
   - sugestões de resposta dentro da conversa;
   - adaptação ao histórico e contexto do contato;
   - confirmação humana antes do envio quando exigido.

2. **Templates inteligentes**
   - criação assistida de templates;
   - revisão de texto, intenção, categoria e variáveis;
   - preparação para submissão à Meta;
   - governança de aprovação antes de publicação ou uso.

3. **Inteligência operacional**
   - resumo de conversas;
   - identificação de intenção;
   - próximos passos sugeridos;
   - priorização de atendimentos;
   - apoio a classificação e organização da caixa de entrada.

4. **Ação do uni.co dentro do Zuni**
   - o uni.co pode receber contexto governado da conversa;
   - pode devolver rascunhos, recomendações ou ações propostas;
   - ações reais permanecem sujeitas às permissões e regras do Zuni;
  - nenhuma ação crética deve ocorrer de forma implícita ou sem trilha de auditoria.

5. **Operação de WhatsApp**
   - atuação nos canais habilitados pelo tenant;
  - respeito à janela de atendimento da Meta;
   - uso de templates aprovados fora da janela quando aplicável;
   - observação das regras de consentimento, segurança e identidade do operador.

## 4. Limites de responsabilidade

### Zuni é responsável por

- canais;
- conversas;
- contatos;
- mensagens;
- templates WhatsApp;
- configuração Meta;
- janela de atendimento;
- identidade do operador;
- envio;
- auditoria operacional;
- experiência web/mobile/tablet.

### uni.co é responsável por

- contexto cognitivo;
- geração e revisão de texto;
- análise de intenção ;
- sumarização;
- recomendações;
- proposta de ação;
- menória e inteligência institucional conforme contrato.

O uni.co **n⃣o deve duplicar o core operacional do Zuni**. O Zuni **não deve duplicar o core cognitivo do uni.co**.

## 5. Contrato de integração

A integração Zuni ↔ uni.co deve ser:

- explícita;
- autenticada;
- tenant-aware;
- auditável;
- versionada;
- observável;
- reversível;
- sem compartilhamento de segredos no frontend.

Entradas mínimas de contexto podem incluir:

- tenant;
- canal;
- contato;
- conversa;
- mensagens relevantes;
- estado da janela de atendimento;
- intenção da operação;
- identidade do operador quando necessário.

Saídas esperadas do uni.co podem incluir:

- `draft_reply`;
- `summary`;
- `intent`;
- `template_draft`;
- `recommended_action`;
- `confidence`;
- `reasoning_summary` operacional, sem expor cadeia interna de raciocínio.

## 6. Entitlements do Master

Recursos exclusivos do Master devem ser controlados por entitlement, e não por flags soltas de frontend.

Entitlements iniciais propostos:

- `zuni.unico.enabled`
- `zuni.ai.reply_assist`
- `zuni.ai.conversation_summary`
- `zuni.ai.intent`
- `zuni.ai.template_assist`
- `zuni.ai.recommended_actions`

A implementação real desses entitlements deve reutilizar o núcleo de planos/entitlements da plataforma quando aplicável.

## 7. Experiência do produto

O Master deve parecer um único produto.

O usuário não deve precisar “sair do Zuni” para usar o uni.co. A inteligência deve aparecer no fluxo do atendimento, com ações claras como:

- **Sugerir resposta**
- **Resumir conversa**
- **Criar template**
- **Melhorar template**
- **Analisar intenção**
- **Sugerir próximo passo**

A interface deve distinguir claramente:

- conteúdo sugerido pela IA;
- conteúdo aprovado pelo operador;
- ação já executada;
- ação ainda pendente de aprovação.

## 8. Governança de ação

A IA pode sugerir e preparar.

Envio de mensagem, publicação de template, mudança de configuração, disparo em massa ou outras ações sensíveis devem continuar respeitando confirmação, permissões e trilha de auditoria.

O Master não é um bypass de segurança.

## 9. Fases de construção

### Fase 1 — Base funcional
- estabilizar caixa de entrada;
- resposta manual;
- templates;
- sessão do operador;
- responsividade;
- contratos de backend.

### Fase 2 — Ponte cognitiva
- contrato Zuni → uni.co;
- resposta assistida;
- resumo;
- intenção;
- telemetria e auditoria.

### Fase 3 — Templates Master
- criação assistida;
- revisão;
- variáveis;
- classificação;
- preparação para submissão à Meta.

### Fase 4 — Ações assistidas
- recomendações;
- próximos passos;
- automações governadas;
- entitlements por plano;
- observabilidade ponta a ponta.

## 10. Critério de pronto

O Zuni Master só pode ser considerado funcionalmente pronto quando:

- o Zuni operar conversas e mensagens ponta a ponta;
- o uni.co responder por contrato real;
- sugestões aparecerem na interface;
- o operador puder aprovar ou rejeitar;
- ações executadas forem auditáveis;
- templates seguirem a política da Meta;
- entitlements do Master forem verificáveis;
- web, mobile e tablet funcionarem;
- testes e observabilidade cobrirem o fluxo completo.

## 11. Estado desta reancoragem

**Confirmado**
- Zuni Master = Zuni + uni.co.
- Preço de lançamento = R$ 1.690/mês.
- O plano é reconstruído a partir de 2026-08-12.
- O Zuni permanece dono da operação.
- O uni.co permanece dono da inteligência.
- Segurança e aprovação humana continuam obrigatórias para ações sensíveis.

**Pendente**
- implementação dos entitlements;
- contrato cognitivo final;
- UX definitiva dos recursos de IA;
- envio de templates pelo Master;
- billing real do plano;
- definição de eventual plano anual.

**Bloqueado**
- nenhuma funcionalidade desta reancoragem deve ser considerada em produção sem implementação, testes e evidência de deploy.
