export const catalog = Object.freeze({
  productId: "uni-co",
  currency: "BRL",
  billingCycles: ["monthly"],
  plans: [
    { id: "start", name: "Start", monthlyCents: 29700, state: "early_access", sellable: true, summary: "Para começar com presença, atendimento e operação assistida." },
    { id: "pro", name: "Pro", monthlyCents: 59700, state: "early_access", sellable: true, summary: "Para equipes que precisam de automação, integrações e mais contexto." },
    { id: "scale", name: "Scale", monthlyCents: 129000, state: "early_access", sellable: true, summary: "Para operações maiores, governança, auditoria e suporte prioritário." }
  ]
});
