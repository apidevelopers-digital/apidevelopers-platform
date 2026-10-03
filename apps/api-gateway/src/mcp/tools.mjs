import { RISK, approvalForRisk } from "./risk-policy.mjs";

const tool = (definition) => Object.freeze({
  ...definition,
  approval: definition.approval || approvalForRisk(definition.risk)
});

export const ADA_MCP_TOOLS = Object.freeze([
  tool({ name: "github.status", ns: "github", risk: RISK.R1, backend: "github", description: "Read GitHub org, repo, branch, PR and workflow status." }),
  tool({ name: "github.prepare_change", ns: "github", risk: RISK.R2, backend: "github", description: "Prepare controlled GitHub changes through dry-run." }),
  tool({ name: "github.merge_request", ns: "github", risk: RISK.R3, backend: "github", description: "Request approved merge." }),
  tool({ name: "hostinger.inventory", ns: "hostinger", risk: RISK.R1, backend: "hostinger", description: "Read Hostinger websites, DNS, databases and runtime inventory." }),
  tool({ name: "hostinger.change_request", ns: "hostinger", risk: RISK.R3, backend: "hostinger", description: "Request approved Hostinger/DNS/deploy mutation." }),
  tool({ name: "meta.status", ns: "meta", risk: RISK.R1, backend: "meta", description: "Read Meta, Instagram, Facebook and WhatsApp Cloud status/templates." }),
  tool({ name: "meta.publish_request", ns: "meta", risk: RISK.R3, backend: "meta", description: "Request approved post, reply, ad or message send." }),
  tool({ name: "vnnox.players_status", ns: "vnnox", risk: RISK.R1, backend: "vnnox", description: "Read VNNOX player/online status." }),
  tool({ name: "vnnox.action_request", ns: "vnnox", risk: RISK.R3, backend: "vnnox", description: "Request approved VNNOX publish/power/brightness/restart." }),
  tool({ name: "operator.actions", ns: "operator", risk: RISK.R1, backend: "operator", description: "Read institutional approval/action queue." }),
  tool({ name: "mitra.context_read", ns: "mitra", risk: RISK.R1, backend: "mitra", description: "Read Peterle/Mitra context and diagnostics without secrets." }),
  tool({ name: "peterle.ops_request", ns: "peterle", risk: RISK.R3, backend: "peterle", description: "Request approved Peterle/Mitra operational mutation." })
]);

export const listTools = ({ ns } = {}) => ns ? ADA_MCP_TOOLS.filter((t) => t.ns === ns) : ADA_MCP_TOOLS;
export const getTool = (name) => ADA_MCP_TOOLS.find((t) => t.name === name) || null;
