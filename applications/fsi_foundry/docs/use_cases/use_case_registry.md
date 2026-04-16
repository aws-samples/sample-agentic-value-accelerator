# Use Case Registry

Complete catalog of all FSI Foundry use cases. Each use case is a multi-agent implementation built on the shared foundations with LangGraph/LangChain and Strands framework support, deployable to AgentCore Runtime.

---

## Banking

| Use Case | Agents | Frameworks |
|----------|--------|------------|
| [KYC Risk Assessment](../../use_cases/kyc_banking/README.md) | Credit Analyst, Compliance Officer | LangGraph, Strands |
| [Agentic Payments](../../use_cases/agentic_payments/README.md) | Payment Validator, Routing Agent, Reconciliation Agent | LangGraph, Strands |
| [Customer Service](../../use_cases/customer_service/README.md) | Inquiry Handler, Transaction Specialist, Product Advisor | LangGraph, Strands |
| [Customer Chatbot](../../use_cases/customer_chatbot/README.md) | Conversation Manager, Account Agent, Transaction Agent | LangGraph, Strands |
| [Customer Support](../../use_cases/customer_support/README.md) | Ticket Classifier, Resolution Agent, Escalation Agent | LangGraph, Strands |
| [Document Search](../../use_cases/document_search/README.md) | Document Indexer, Search Agent | LangGraph, Strands |
| [AI Assistant](../../use_cases/ai_assistant/README.md) | Task Router, Data Lookup Agent, Report Generator | LangGraph, Strands |
| [Corporate Sales](../../use_cases/corporate_sales/README.md) | Lead Scorer, Opportunity Analyst, Pitch Preparer | LangGraph, Strands |
| [Payment Operations](../../use_cases/payment_operations/README.md) | Exception Handler, Settlement Agent | LangGraph, Strands |
| [Agentic Commerce](../../use_cases/agentic_commerce/README.md) | Offer Engine, Fulfillment Agent, Product Matcher | LangGraph, Strands |

## Risk and Compliance

| Use Case | Agents | Frameworks |
|----------|--------|------------|
| [Fraud Detection](../../use_cases/fraud_detection/README.md) | Transaction Monitor, Pattern Analyst, Alert Generator | LangGraph, Strands |
| [Document Processing](../../use_cases/document_processing/README.md) | Document Classifier, Data Extractor, Validation Agent | LangGraph, Strands |
| [Credit Risk Assessment](../../use_cases/credit_risk/README.md) | Financial Analyst, Risk Scorer, Portfolio Analyst | LangGraph, Strands |
| [Compliance Investigation](../../use_cases/compliance_investigation/README.md) | Evidence Gatherer, Pattern Matcher, Regulatory Mapper | LangGraph, Strands |
| [Adverse Media Screening](../../use_cases/adverse_media/README.md) | Media Screener, Sentiment Analyst, Risk Signal Extractor | LangGraph, Strands |
| [Market Surveillance](../../use_cases/market_surveillance/README.md) | Trade Pattern Analyst, Communication Monitor, Surveillance Alert Generator | LangGraph, Strands |

## Capital Markets

| Use Case | Agents | Frameworks |
|----------|--------|------------|
| [Investment Advisory](../../use_cases/investment_advisory/README.md) | Portfolio Analyst, Market Researcher, Client Profiler | LangGraph, Strands |
| [Earnings Summarization](../../use_cases/earnings_summarization/README.md) | Transcript Processor, Metric Extractor, Sentiment Analyst | LangGraph, Strands |
| [Economic Research](../../use_cases/economic_research/README.md) | Data Aggregator, Trend Analyst, Research Writer | LangGraph, Strands |
| [Email Triage](../../use_cases/email_triage/README.md) | Email Classifier, Action Extractor | LangGraph, Strands |
| [Trading Assistant](../../use_cases/trading_assistant/README.md) | Market Analyst, Trade Idea Generator, Execution Planner | LangGraph, Strands |
| [Research Credit Memo](../../use_cases/research_credit_memo/README.md) | Data Gatherer, Credit Analyst, Memo Writer | LangGraph, Strands |
| [Investment Management](../../use_cases/investment_management/README.md) | Allocation Optimizer, Rebalancing Agent, Performance Attributor | LangGraph, Strands |
| [Data Analytics](../../use_cases/data_analytics/README.md) | Data Explorer, Statistical Analyst, Insight Generator | LangGraph, Strands |
| [Trading Insights](../../use_cases/trading_insights/README.md) | Signal Generator, Cross Asset Analyst, Scenario Modeler | LangGraph, Strands |

## Insurance

| Use Case | Agents | Frameworks |
|----------|--------|------------|
| [Customer Engagement](../../use_cases/customer_engagement/README.md) | Churn Predictor, Outreach Agent, Policy Optimizer | LangGraph, Strands |
| [Claims Management](../../use_cases/claims_management/README.md) | Claims Intake Agent, Damage Assessor, Settlement Recommender | LangGraph, Strands |
| [Life Insurance Agent](../../use_cases/life_insurance_agent/README.md) | Needs Analyst, Product Matcher, Underwriting Assistant | LangGraph, Strands |

## Operations

| Use Case | Agents | Frameworks |
|----------|--------|------------|
| [Call Center Analytics](../../use_cases/call_center_analytics/README.md) | Call Monitor, Agent Performance Analyst, Operations Insight Generator | LangGraph, Strands |
| [Post Call Analytics](../../use_cases/post_call_analytics/README.md) | Transcription Processor, Sentiment Analyst, Action Extractor | LangGraph, Strands |
| [Call Summarization](../../use_cases/call_summarization/README.md) | Key Point Extractor, Summary Generator | LangGraph, Strands |

## Modernization

| Use Case | Agents | Frameworks |
|----------|--------|------------|
| [Legacy Migration](../../use_cases/legacy_migration/README.md) | Code Analyzer, Migration Planner, Conversion Agent | LangGraph, Strands |
| [Code Generation](../../use_cases/code_generation/README.md) | Requirement Analyst, Code Scaffolder, Test Generator | LangGraph, Strands |
| [Mainframe Migration](../../use_cases/mainframe_migration/README.md) | Mainframe Analyzer, Business Rule Extractor, Cloud Code Generator | LangGraph, Strands |

---

## Deployment Pattern

All use cases deploy to AgentCore Runtime:

| Pattern | Description | Best For |
|---------|-------------|----------|
| AgentCore | Bedrock AgentCore Runtime | Scalable, serverless deployments |

## Registry Configuration

Use case definitions and deployment configurations live in:

```
applications/fsi_foundry/data/registry/offerings.json
```

## Adding New Use Cases

See [Adding Applications](../foundations/development/adding_applications.md) for the step-by-step guide.
