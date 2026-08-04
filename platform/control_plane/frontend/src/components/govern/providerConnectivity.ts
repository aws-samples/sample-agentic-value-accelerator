/**
 * providerConnectivity — the SINGLE honest source of truth for which providers
 * AVA is actually connected to.
 *
 * The multi-cloud story only holds if every surface agrees: the value pitch is
 * "this is really YOUR data", so one surface saying Azure is "Connected" while
 * another says "Not connected" quietly breaks the trust. This module is that one
 * truth — the Inventory card, the cost ProviderConnectorsCard, and the
 * Multi-Cloud Providers tab all read it.
 *
 * Reality today: only AWS is genuinely connected (real account, live APIs). Every
 * other provider is a scaffold that names the connector it needs. AWS's own
 * connected state is still gated on there being live data — a deployed AVA with a
 * connected account flips it on; an empty/demo instance shows it honestly off.
 */
import type { AgentProvider } from './mockData';

/** connected = live feed wired + returning data; scaffold = connector not built. */
export type ConnectivityState = 'connected' | 'scaffold';

export interface ProviderConnectivity {
  provider: AgentProvider;
  /** Whether a real connector exists for this provider TODAY (AWS only). */
  liveCapable: boolean;
  /** Human label for the connector / listing source. */
  connectorLabel: string;
  /** What's needed to connect (shown when not connected). */
  needs: string;
}

// AWS is the only live-capable provider today; the rest name their real connector.
export const PROVIDER_CONNECTIVITY: Record<Exclude<AgentProvider, 'custom'>, ProviderConnectivity> = {
  aws: {
    provider: 'aws',
    liveCapable: true,
    connectorLabel: 'AWS — Cost Explorer, CloudWatch, Bedrock, deployments',
    needs: 'Connected — live from the AVA-linked AWS account.',
  },
  azure: {
    provider: 'azure',
    liveCapable: false,
    connectorLabel: 'Azure AI Foundry',
    needs: 'Needs an Azure connector (AI Foundry / Agent Service listing + Cost Management) — not wired.',
  },
  gcp: {
    provider: 'gcp',
    liveCapable: false,
    connectorLabel: 'Google Vertex AI',
    needs: 'Needs a Google Cloud connector (Vertex Agent Builder + Billing/BigQuery export) — not wired.',
  },
  servicenow: {
    provider: 'servicenow',
    liveCapable: false,
    connectorLabel: 'ServiceNow AI Agents',
    needs: 'Needs a ServiceNow connector (AI Agent Studio inventory API) — not wired.',
  },
  salesforce: {
    provider: 'salesforce',
    liveCapable: false,
    connectorLabel: 'Salesforce Agentforce',
    needs: 'Needs a Salesforce connector (Agentforce metadata API) — not wired.',
  },
  copilot_studio: {
    provider: 'copilot_studio',
    liveCapable: false,
    connectorLabel: 'Microsoft Copilot Studio',
    needs: 'Needs a Copilot Studio connector (Power Platform agent listing) — not wired.',
  },
};

export const ALL_CONNECTIVITY = Object.values(PROVIDER_CONNECTIVITY);

/**
 * The effective connectivity state for a provider.
 * AWS is 'connected' only when it genuinely has live data (awsLive); everything
 * else is always 'scaffold' until its connector is built.
 */
export function connectivityState(provider: AgentProvider, awsLive: boolean): ConnectivityState {
  if (provider === 'aws') return awsLive ? 'connected' : 'scaffold';
  return 'scaffold';
}
