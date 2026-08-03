// consoleLinks.ts — build an AWS-console deep-link (and surface the real resource id) for each
// AgentCore primitive shown in the StackRail. The ids come from window.APP_CONFIG.AGENTCORE,
// injected by deploy.sh; if they're absent (older config.js / dev build) the primitive still
// links to the right console page — the id is shown inline when available.
//
// The routes below are the REAL console paths (verified live from the AgentCore console address
// bar), which are PATH-based (/bedrock-agentcore/agents), not the older #/hash form — that's why
// a hash guess fell back to the Overview page. Registry + Harness routes weren't confirmed yet, so
// they fall back to the AgentCore Overview (a real page, never a 404) until the exact path is known.

import type { AppConfig } from '../auth';

export interface PrimitiveLink {
  /** The AWS console URL to open in a new tab. */
  href: string;
  /** The concrete resource id (+ version, where known) to show + let the operator copy. '' when none. */
  resourceId: string;
  /** Human label for the console destination, e.g. "Bedrock AgentCore · Runtime". */
  service: string;
}

/** Path-based AgentCore console URL, region-anchored. `path` is everything after the service root. */
function ac(region: string, path: string): string {
  const q = path.includes('?') ? '&' : '?';
  return `https://${region}.console.aws.amazon.com/bedrock-agentcore/${path}${q}region=${region}`;
}

/**
 * Resolve the deep-link for a primitive key. Always returns a link (every primitive has a real
 * console home); `resourceId` is populated when the id is available in config.
 */
export function primitiveLink(key: string, cfg: AppConfig): PrimitiveLink {
  const region = cfg.REGION || 'us-west-2';
  const acx = cfg.AGENTCORE || {};
  const overview = ac(region, 'overview'); // safe fallback: a real AgentCore page, never a 404

  switch (key) {
    case 'runtime': {
      // Show the exact runtime + its live version inline (the console lists agent runtimes here).
      const ver = acx.runtime_version ? ` · v${acx.runtime_version}` : '';
      return { href: ac(region, 'agents'), resourceId: (acx.runtime_id || '') + (acx.runtime_id ? ver : ''), service: 'Bedrock AgentCore · Runtime' };
    }
    case 'swarm':
      // The Strands swarm is a construct INSIDE the runtime — no standalone console page. Point at
      // the runtime (agents) page so the click lands somewhere true.
      return { href: ac(region, 'agents'), resourceId: acx.runtime_id || '', service: 'Bedrock AgentCore · Runtime (hosts the swarm)' };
    case 'gateway':
      return { href: ac(region, 'toolsAndGateways'), resourceId: acx.gateway_id || '', service: 'Bedrock AgentCore · Tools & Gateways' };
    case 'identity':
      return { href: ac(region, 'identity'), resourceId: '', service: 'Bedrock AgentCore · Identity' };
    case 'memory':
      return { href: ac(region, 'memory'), resourceId: acx.memory_id || '', service: 'Bedrock AgentCore · Memory' };
    case 'code':
      return { href: ac(region, 'code'), resourceId: acx.code_interpreter_id || '', service: 'Bedrock AgentCore · Code Interpreter' };
    case 'browser':
      return { href: ac(region, 'browser'), resourceId: acx.browser_id || '', service: 'Bedrock AgentCore · Browser' };
    case 'observability':
      // Known-good CloudWatch GenAI route (mirrors lambda/observability/index.py).
      return {
        href: `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#gen-ai-observability:agent-list`,
        resourceId: acx.runtime_id || '',
        service: 'CloudWatch · GenAI Observability',
      };
    case 'evaluations':
      return { href: ac(region, 'evaluations?tab=evaluations'), resourceId: acx.evaluator_id || '', service: 'Bedrock AgentCore · Evaluations' };
    case 'registry':
      // Route not confirmed yet → land on the AgentCore Overview (real page) + show the id.
      return { href: overview, resourceId: acx.registry_id || '', service: 'Bedrock AgentCore · Registry' };
    case 'harness':
      // Route not confirmed yet → land on the AgentCore Overview (real page) + show the id.
      return { href: overview, resourceId: acx.harness_id || '', service: 'Bedrock AgentCore · Harness' };
    case 'optimization':
      return { href: ac(region, 'optimizations?tab=recommendations'), resourceId: acx.runtime_id || '', service: 'Bedrock AgentCore · Optimizations' };
    default:
      return { href: overview, resourceId: '', service: 'Bedrock AgentCore' };
  }
}
