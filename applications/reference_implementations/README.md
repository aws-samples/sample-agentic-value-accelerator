# Reference Implementations

End-to-end full-stack solutions for specific FSI use cases. Each reference implementation is a complete, self-contained project with its own infrastructure, frontend, backend, and deployment pipeline.

---

## Implementations

| Implementation | Domain | Description |
|---------------|--------|-------------|
| [Market Surveillance](market-surveillance/README.md) | Capital Markets | Real-time trade monitoring with decision-tree rules, multi-agent orchestration, and audit-ready reports |
| [Shopping Concierge Agent](shopping-concierge-agent/README.md) | Agentic Payments | AI-powered concierge with product search, cart management, payment support, and Cognito auth |
| [Case Management](case-management/README.md) | Risk & Compliance | Fraud detection and case management with pattern recognition (smurfing, mule accounts, high-velocity), conversational investigation, and optional AgentCore SAR generation |
| [Agent Safety](agent-safety/README.md) | Safety & Governance | Safety controls for Bedrock AgentCore — budget/eval/observability auto-provisioning, session interventions, kill switch, audit trail, and centralized dashboard |
| [Payments Fraud](payments-fraud/README.md) | Payments & Fraud | Agent-native fraud scoring, NL investigation (smurfing, velocity, mule networks), and FinCEN-structured SAR drafting — a supervisor + 3 specialist agents on Bedrock AgentCore (Strands), with a Next.js UI and Cognito auth |

---

## How Reference Implementations Differ from FSI Foundry

| | Reference Implementations | FSI Foundry |
|---|---|---|
| Scope | Full-stack end-to-end solution | Multi-agent backend POC |
| Infrastructure | Self-contained per project | Shared foundations across use cases |
| Frontend | Included | Testing dashboard only |
| Deployment | Standalone | Three shared patterns (EC2, SF, AgentCore) |
| Best for | Deploying a complete solution | Exploring agent patterns across domains |

---

## Contributing a Reference Implementation

Reference implementations are contributed by project owners and should include:

1. Complete source code (frontend and backend)
2. Infrastructure as Code
3. Deployment scripts
4. Documentation with architecture diagrams
5. Sample data for demonstration

Place your project in its own directory under `reference_implementations/` with a README.

---

## Related

- [FSI Foundry](../fsi_foundry/) — Multi-agent POC implementations on shared foundations
- [App Factory](../app_factory/) — Markdown blueprints for generating agentic applications
- [AVA Overview](../../README.md) — Full project overview
