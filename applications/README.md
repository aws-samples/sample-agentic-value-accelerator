# Applications

Multi-agent AI applications for financial services. This directory contains three categories of applications, each serving a different adoption path.

---

## Table of Contents

- [Reference Implementations](#reference-implementations)
- [FSI Foundry](#fsi-foundry)
- [App Factory](#app-factory)
- [Which Should I Use?](#which-should-i-use)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Documentation](#documentation)

---

## Reference Implementations

End-to-end full-stack solutions for specific FSI use cases. Each implementation is a complete, self-contained project with its own frontend, backend, infrastructure, and deployment pipeline.

| Implementation | Domain | Description |
|---------------|--------|-------------|
| Trade Surveillance | Capital Markets | Real-time trade monitoring, pattern detection, and regulatory alerting |
| Intelligent Document Processing | Operations | Automated document ingestion, classification, extraction, and validation |

[View all reference implementations](reference_implementations/)

---

## FSI Foundry

A collection of multi-agent POC implementations spanning banking, insurance, capital markets, and operations — all built on one shared foundation of infrastructure and backend code.

- One codebase, three deployment patterns — EC2/ALB, Step Functions, or AgentCore Runtime
- Two framework implementations per use case — LangGraph/LangChain and Strands
- Shared foundations — adapters, base classes, Terraform modules, Docker configs, agent registry
- Deploy any use case with a single interactive script

34 use cases across 6 FSI domains:

| Domain | Count | Examples |
|--------|-------|---------|
| Banking | 10 | KYC Risk Assessment, Agentic Payments, Customer Service, Customer Chatbot |
| Risk and Compliance | 6 | Fraud Detection, Credit Risk Assessment, Compliance Investigation |
| Capital Markets | 9 | Investment Advisory, Trading Assistant, Earnings Summarization |
| Insurance | 3 | Customer Engagement, Claims Management, Life Insurance Agent |
| Operations | 3 | Call Center Analytics, Post Call Analytics, Call Summarization |
| Modernization | 3 | Legacy Migration, Code Generation, Mainframe Migration |

[View FSI Foundry documentation](fsi_foundry/)

---

## App Factory

Declarative markdown blueprints that describe complete agentic applications end-to-end — agent logic, infrastructure, deployment pipelines, and tests — designed to be fed into AI coding assistants to generate fully functional apps.

[View App Factory](app_factory/)

---

## Which Should I Use?

| Scenario | Recommended Path |
|----------|-----------------|
| Need a complete, deployable solution for a specific use case | Reference Implementations |
| Exploring multi-agent patterns across FSI domains | FSI Foundry |
| Building multiple use cases on shared infrastructure | FSI Foundry |
| Generating a new application from a specification | App Factory |

---

## Getting Started

```bash
# Deploy an FSI Foundry use case (interactive)
cd fsi_foundry
./scripts/main/deploy.sh

# Explore a reference implementation
cd reference_implementations/<project-name>
# Follow the project-specific README
```

---

## Directory Structure

```
applications/
├── reference_implementations/   # End-to-end full-stack solutions
├── fsi_foundry/                 # Multi-agent POCs on shared foundations
│   ├── foundations/             # Reusable infrastructure
│   │   ├── src/                # Adapters, base classes, tools
│   │   ├── iac/                # Terraform modules (EC2, SF, AgentCore)
│   │   ├── docker/             # Container configurations
│   │   └── ui/                 # Testing dashboard
│   ├── use_cases/              # 34 FSI use case implementations
│   ├── data/                   # Agent registry and sample data
│   ├── docs/                   # Architecture, deployment, security
│   └── scripts/                # deploy.sh, test.sh, cleanup.sh
├── app_factory/                 # Markdown blueprints for app generation
└── README.md                    # This file
```

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Reference Implementations](reference_implementations/) | Available full-stack solutions |
| [FSI Foundry](fsi_foundry/) | Architecture, foundations, and use cases |
| [Deployment Guide](fsi_foundry/docs/foundations/deployment/) | Step-by-step deployment instructions |
| [Security](fsi_foundry/docs/foundations/security/) | Threat model, AI security, AWS service security |
| [Adding Use Cases](fsi_foundry/docs/foundations/development/adding_applications.md) | How to add new use cases to FSI Foundry |
| [App Factory](app_factory/) | Blueprint specifications |

---

## License

See [LICENSE](../LICENSE) for details.
