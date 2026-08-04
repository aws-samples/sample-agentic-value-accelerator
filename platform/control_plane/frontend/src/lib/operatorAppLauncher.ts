import { frontierAgentsApi } from '../api/client';

/**
 * Open the operator app for a frontier agent (DevOps / Security) without
 * forcing the user to manually sign in to the AWS console.
 *
 * AWS's federation endpoint only accepts AWS Management Console URLs as
 * Destination — it returns HTTP 400 for *.aidevops.global.app.aws and
 * *.securityagent.global.app.aws. So we use a two-step pattern:
 *
 *   1. Open the federation URL → AWS console drops the federation
 *      cookie on .amazon.com and lands on the console home page.
 *   2. Open the operator app URL in a second tab. The browser sends
 *      the federation cookie on the cross-domain auth handshake, so
 *      the operator app loads already authenticated.
 *
 * The two-tab UX is the trade-off for this AWS limitation. Falls back
 * to opening the bare operator URL if federation fails for any reason
 * (existing console-session UX still works in that case).
 */
export async function openOperatorApp(agentId: string, operatorUrl: string) {
  // Browsers strip the user-activation token after the first await, so
  // window.open() calls after the federation API returns are silently
  // blocked. Strategy: open BOTH tabs synchronously (one is a placeholder
  // for the federation URL) and navigate them once the API returns.
  //
  // For Security Agent the federation tab IS the agent-space view (via
  // a console deeplink) and the bare app URL rejects the federation
  // cookie — so the operator-app placeholder gets closed when the
  // backend returns operator_app_url="".
  const operatorWin = window.open('about:blank', '_blank');
  const federationWin = window.open('about:blank', '_blank');

  try {
    const { signin_url, operator_app_url } = await frontierAgentsApi.federate({
      agent_id: agentId,
      operator_app_url: operatorUrl,
    });
    if (federationWin) federationWin.location.href = signin_url;
    if (operatorWin) {
      if (operator_app_url) {
        operatorWin.location.href = operator_app_url;
      } else {
        // Backend signaled the second tab isn't usable for this agent
        // (e.g. Security Agent — the federation tab IS the destination).
        operatorWin.close();
      }
    }
  } catch (e) {
    console.warn('Federation failed, falling back to direct app URL:', e);
    // Repurpose one placeholder for the bare URL, close the other.
    if (operatorWin) operatorWin.location.href = operatorUrl;
    if (federationWin) federationWin.close();
  }
}
