/**
 * guardrailTelemetryMetrics — per-template guardrail metrics from ONE telemetry call.
 *
 * Three Govern hooks used to build their per-template metrics map by looping
 * `guardrailsApi.getMetrics(template_id)` — one HTTP request per guardrail, N requests
 * to render one page, and every one of them a 404 whenever the template store was
 * unreadable. `GET /govern/guardrails/telemetry` already returns the same CloudWatch
 * rollup for every guardrail in the account in a single request, so the fan-out was
 * never buying anything.
 *
 * What the swap costs, stated plainly:
 *   - `time_series` is not in the telemetry payload, so it comes back empty. No Govern
 *     surface charts it (the per-template sparkline was never built).
 *   - The window is whatever `days` the telemetry call asked for, not a fixed 24h.
 *     Callers pass the window they intend to label.
 *
 * What it does NOT change: `total_invocations`, `blocked_count`, `allowed_count` and
 * `block_rate` are the same numbers computed the same way — the per-template endpoint
 * also read Invocations and InvocationsBlocked from AWS/Bedrock/Guardrails and derived
 * allowed as the difference.
 */

import type { AwsGuardrailTelemetryResponse } from '../../api/client';
import type { GuardrailMetrics, GuardrailTemplate } from '../../types';

/**
 * Map AVA template_id -> live CloudWatch metrics, joined on the Bedrock guardrail id.
 *
 * A template whose Bedrock guardrail no longer exists is simply absent from the map,
 * which is what the old per-template call produced too (it 404'd and was discarded).
 * Absent means "no measurement", and callers must not read it as zero traffic.
 */
export function metricsByTemplateId(
  templates: GuardrailTemplate[],
  telemetry: AwsGuardrailTelemetryResponse | null,
): Map<string, GuardrailMetrics> {
  const out = new Map<string, GuardrailMetrics>();
  if (!telemetry?.guardrails?.length) return out;

  const live = new Map(telemetry.guardrails.map(g => [g.guardrail_id, g]));
  for (const t of templates) {
    if (!t.guardrail_id) continue;                 // still a draft: nothing in AWS to measure
    const g = live.get(t.guardrail_id);
    if (!g) continue;                              // guardrail deleted in AWS, template left behind
    const invocations = g.invocations ?? 0;
    const blocked = g.blocked ?? 0;
    out.set(t.template_id, {
      guardrail_id: t.guardrail_id,
      total_invocations: invocations,
      blocked_count: blocked,
      allowed_count: Math.max(invocations - blocked, 0),
      // CloudWatch has no per-guardrail masking metric. The account-wide count exists
      // as SensitiveInformationPolicy in telemetry.by_policy; attributing it to one
      // guardrail would be a guess, so this stays 0 here rather than being invented.
      anonymized_count: 0,
      block_rate: invocations > 0 ? Math.round((blocked / invocations) * 1000) / 10 : 0,
      filter_breakdown: {},
      time_series: [],
      recent_events: [],
    });
  }
  return out;
}

/** Account-wide masking/redaction interventions (SensitiveInformationPolicy). */
export function anonymizedFromPolicies(telemetry: AwsGuardrailTelemetryResponse | null): number {
  const row = telemetry?.by_policy?.find(p => p.policy_type === 'SensitiveInformationPolicy');
  return row?.interventions ?? 0;
}
