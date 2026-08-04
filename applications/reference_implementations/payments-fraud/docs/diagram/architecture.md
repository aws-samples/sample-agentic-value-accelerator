# Architecture

System architecture for the Payments Fraud reference implementation. The Mermaid
below is the canonical source and renders inline on GitLab/GitHub.

Key points:
- The browser never holds AWS credentials. The **Next.js BFF** (`/api/agent`) invokes
  the AgentCore runtime server-side with **SigV4**.
- **Cognito** gates *login* to the UI; it is not in the request path to the agent.
- A **supervisor** agent routes each request to one of three specialists (and chains
  investigation → SAR). All run on **Bedrock AgentCore** via the Strands SDK.

```mermaid
graph TB
    subgraph Browser["Browser"]
        UI["Next.js + MUI UI<br/>Simulate · Investigate · SAR"]
    end

    subgraph BFF["Next.js server (BFF)"]
        CFG["/api/config<br/>(Cognito IDs)"]
        AGT["/api/agent<br/>(SigV4 → AgentCore)"]
    end

    COG["Amazon Cognito<br/>user pool (login gate)"]

    subgraph Runtime["Bedrock AgentCore Runtime"]
        SUP["Supervisor agent<br/>(routes / chains)"]
        SCO["Transaction Scorer<br/>(Haiku 4.5)"]
        INV["Investigation agent<br/>(Sonnet 4.5)"]
        SAR["SAR Report agent<br/>(Sonnet 4.5)"]
        SUP --> SCO
        SUP --> INV
        SUP --> SAR
        INV -.findings.-> SAR
    end

    subgraph Data["Data stores (KMS-encrypted)"]
        DDB["DynamoDB<br/>transactions · cases · SARs"]
        S3["S3<br/>account profiles · sample data"]
    end

    BR["Amazon Bedrock<br/>Claude models"]
    LF["Langfuse<br/>(optional, via Foundation Stack)"]

    UI -->|"Amplify sign-in"| COG
    UI -->|"fetch (JSON)"| AGT
    UI -->|"runtime config"| CFG
    AGT -->|"InvokeAgentRuntime (SigV4)"| SUP

    SCO --> DDB
    SCO --> S3
    INV --> DDB
    INV --> S3
    SAR --> DDB
    SCO --> BR
    INV --> BR
    SAR --> BR
    SUP --> BR
    Runtime -.OTLP traces.-> LF
```

> Note: this reference implementation runs the frontend locally (`npm run dev`). A
> production-facing deployment would additionally host the BFF (e.g. Amplify Hosting /
> ECS) behind CloudFront and could switch the runtime to validate Cognito JWTs directly.
