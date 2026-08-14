import RegistryPlaceholder from './RegistryPlaceholder';

// Placeholder for /registry/agents. Backend agent-registry-control wrappers
// aren't live yet; this view will list published `agent` records from the
// AVA registry once they are, with search + approval status.
export default function RegistryAgents() {
  return (
    <RegistryPlaceholder
      section="agents"
      title="Agents"
      tagline="Autonomous peer agents catalogued in the AVA registry. Publish once, discover across teams."
      description="An agent record captures identity + AgentCard + capability tags + cost profile — everything another agent needs to decide when to delegate. Backed by AWS Agent Registry, records go through the AVA Approval Queue before becoming discoverable."
      bulletHeading="What will land here"
      bullets={[
        'Search / filter published agents by capability, owner, risk tier, business unit',
        'Publish flow — reads current AgentCore Harnesses / AaaS agents / custom runtimes',
        'Per-record detail with AgentCard, endpoint, auth mode, sample invocation',
        'Approval status pill (pending / approved / deprecated) linked to Operate → Approval Queue',
        'One-click "Try in Test Console" so agents can be exercised before formal adoption',
      ]}
      iconBg="from-indigo-500 to-blue-600"
      iconPath="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      tags={['AgentCard', 'MCP-callable', 'AWS Agent Registry']}
    />
  );
}
