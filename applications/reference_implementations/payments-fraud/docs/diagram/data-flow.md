# Data Flow

How payment data moves through the system, and where it is stored. All data in this
reference implementation is **synthetic** (see [`../../data/README.md`](../../data/README.md));
there is no real PII.

## Request sequence (score / investigate / SAR)

The three user actions share one path: browser → BFF → AgentCore → tools → Bedrock.
The supervisor routes by the `action` field; investigation findings can feed the SAR.

```mermaid
sequenceDiagram
    actor Analyst
    participant UI as Next.js UI
    participant BFF as BFF /api/agent
    participant RT as AgentCore (supervisor)
    participant SP as Specialist agent
    participant DS as DynamoDB / S3
    participant BR as Bedrock (Claude)

    Analyst->>UI: sign in (Cognito) + submit request
    UI->>BFF: POST {action, account_id, ...} (JSON)
    Note over BFF: signs with server-side SigV4<br/>(no AWS creds in browser)
    BFF->>RT: InvokeAgentRuntime
    RT->>SP: route by action (score / investigate / sar)
    SP->>DS: read profile / transactions / case
    DS-->>SP: account + transaction records
    SP->>BR: reason over data (tool-use loop)
    BR-->>SP: analysis
    SP-->>RT: contract JSON (ScoreResult / InvestigationResult / SARReport)
    RT-->>BFF: response payload
    BFF-->>UI: validated JSON
    UI-->>Analyst: rendered result
    opt SAR persistence
        SP->>DS: write case / SAR record
    end
```

## Data classification & storage

```mermaid
graph LR
    subgraph Inputs["Inputs (synthetic)"]
        TX["Transaction<br/>(amount, network, counterparty,<br/>device, geo)"]
        PR["Account profiles<br/>(baseline, flagged patterns)"]
    end

    subgraph Stores["At rest — KMS-encrypted"]
        S3["S3: profiles + sample data"]
        DDBt["DynamoDB: transactions"]
        DDBc["DynamoDB: cases"]
        DDBs["DynamoDB: SARs"]
    end

    subgraph Transient["In transit / transient"]
        BFFp["BFF request payload"]
        BRp["Bedrock prompt + tool results"]
    end

    PR --> S3
    TX --> DDBt
    TX --> BFFp --> BRp
    PR --> BRp
    BRp -->|"investigation findings"| DDBc
    BRp -->|"SAR draft"| DDBs
```

Notes:
- **At rest:** DynamoDB tables and the S3 bucket are encrypted with a customer-managed
  KMS key; S3 blocks public access and is versioned.
- **In transit:** browser↔BFF over HTTPS (in a hosted deployment); BFF↔AgentCore and
  agent↔Bedrock over AWS SigV4-signed TLS.
- **Human-in-the-loop:** the SAR agent only drafts reports
  (`filing_recommendation` defaults to `needs_human_review`); nothing is filed
  automatically.
- **Observability:** when Langfuse is configured, agent traces (prompts, tool calls)
  are exported via OTLP — be mindful that traces can contain request content.
