/**
 * inventoryConnectors — the agent-inventory connector catalog for the registry.
 *
 * Step 1 of the multi-cloud governance/inventory story: one registry that pulls
 * agent inventory from every provider. AWS is LIVE-discovered today (real
 * deployments + Frontier Agents via useAgentRegistry); the other providers are
 * honest scaffolds — each declares the specific listing API a connector would use,
 * mirroring the cost ProviderConnectorsCard discipline ("not connected — needs X",
 * never faked).
 *
 * `connected`/`agentCount` are filled at render time from live registry data for
 * AWS; the rest stay not-connected until their connector is built.
 */
import type { AgentProvider } from './mockData';

export interface InventoryConnectorDef {
  provider: AgentProvider;
  /** The listing API/source a connector would use to discover agents. */
  source: string;
  /** What's needed to connect (shown when not connected). */
  detail: string;
  /** True only for providers with a live inventory feed today. */
  liveCapable: boolean;
}

// Ordered: live-capable first, then clouds, then SaaS. `custom` is omitted — it's
// an in-platform bucket, not an external inventory source.
export const INVENTORY_CONNECTORS: InventoryConnectorDef[] = [
  {
    provider: 'aws',
    source: 'AVA deployments + Bedrock AgentCore / Frontier Agents',
    detail: 'Live — agents discovered from real AVA Build deployments and the AWS Frontier Agents catalog.',
    liveCapable: true,
  },
  {
    provider: 'azure',
    source: 'Azure AI Foundry — Agent Service listing',
    detail: 'Needs an Azure AI Foundry / Agent Service connector (list agents via the Foundry control-plane API) — not wired.',
    liveCapable: false,
  },
  {
    provider: 'gcp',
    source: 'Vertex AI Agent Builder listing',
    detail: 'Needs a Google Vertex AI Agent Builder connector (list reasoning engines / agents) — not wired.',
    liveCapable: false,
  },
  {
    provider: 'servicenow',
    source: 'ServiceNow AI Agents API',
    detail: 'Needs a ServiceNow connector (AI Agent Studio inventory API) — not wired.',
    liveCapable: false,
  },
  {
    provider: 'salesforce',
    source: 'Salesforce Agentforce API',
    detail: 'Needs a Salesforce Agentforce connector (Agent metadata API) — not wired.',
    liveCapable: false,
  },
  {
    provider: 'copilot_studio',
    source: 'Microsoft Copilot Studio API',
    detail: 'Needs a Copilot Studio connector (agent/bot listing via Power Platform API) — not wired.',
    liveCapable: false,
  },
];
