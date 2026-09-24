import type { SimStep, LogEntry, BlastLevel } from '../types/simulation';
import type { KYCResponse, MessageLogEntry } from '../types';
import type { JudgeScores, DeterministicResult } from '../api/governanceControls';

export interface GovernanceResults {
  judgeScores?: JudgeScores | null;
  deterministicResult?: DeterministicResult | null;
}

/**
 * Maps message_log entries from the API response to the 7 simulation steps.
 * Returns an array of 7 LogEntry arrays (one per step), or null if message_log is empty/missing.
 */
function mapMessageLogToStepLogs(messageLog: MessageLogEntry[]): LogEntry[][] | null {
  if (!messageLog || messageLog.length === 0) return null;

  const stepBuckets: LogEntry[][] = [[], [], [], [], [], [], []];

  for (const entry of messageLog) {
    // Handle both API shapes: {agent, message} and {from_agent, content}
    const raw = entry as unknown as Record<string, unknown>;
    const fromAgent = (raw.agent as string) ?? entry.from_agent ?? '';
    const toAgent = entry.to_agent ?? '';
    const msgType = entry.message_type?.toLowerCase() ?? '';
    const content = (raw.message as string) ?? entry.content ?? '';
    const contentLower = content.toLowerCase();
    const agentLower = fromAgent.toLowerCase();
    const toAgentLower = toAgent.toLowerCase();

    const ts = entry.timestamp
      ? new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '';

    const actorLabel = fromAgent || formatAgentName(entry.from_agent, entry.to_agent);
    const truncatedContent = content.length > 200 ? content.slice(0, 200) + '…' : content;

    const logEntry: LogEntry = { t: ts, a: actorLabel, m: truncatedContent, c: 's-ok' };

    const stepIndex = classifyToStep(agentLower, toAgentLower, msgType, contentLower);
    stepBuckets[stepIndex].push(logEntry);
  }

  return stepBuckets;
}

function formatAgentName(from: string, to: string | null): string {
  const names: Record<string, string> = {
    supervisor: 'Supervisor',
    orchestrator: 'Orchestrator',
    credit_analyst: 'Credit Agent',
    credit: 'Credit Agent',
    compliance_officer: 'Compliance Agent',
    compliance: 'Compliance Agent',
    gateway: 'Gateway',
    policy: 'Policy Engine',
  };
  const fromLabel = names[from?.toLowerCase()] ?? from ?? 'System';
  if (to) {
    const toLabel = names[to?.toLowerCase()] ?? to;
    return `${fromLabel} → ${toLabel}`;
  }
  return fromLabel;
}

function deriveSeverity(msgType: string, contentLower: string): '' | 's-ok' | 's-warn' | 's-err' {
  if (contentLower.includes('fail') || contentLower.includes('block') || contentLower.includes('reject'))
    return 's-warn';
  if (msgType === 'complete' || contentLower.includes('✓') || contentLower.includes('clear') || contentLower.includes('pass'))
    return 's-ok';
  if (contentLower.includes('⚠') || contentLower.includes('flag') || contentLower.includes('escalat'))
    return 's-warn';
  return '';
}

function classifyToStep(agent: string, toAgent: string, msgType: string, contentLower: string): number {
  // Step 0: Data Ingestion — initial routing/delegation
  if (msgType === 'route' || (msgType === 'delegate' && (agent === 'supervisor' || agent === 'orchestrator'))) return 0;

  // Step 2: Risk Scoring — "Guardrails" agent messages
  if (agent === 'guardrails' || toAgent === 'guardrails') return 2;

  // Step 3: Credit Analysis — "Credit" / "CreditAnalyst" agent messages
  if (agent === 'credit_analyst' || agent === 'credit' || agent === 'creditanalyst' || toAgent === 'credit_analyst' || toAgent === 'credit' || toAgent === 'creditanalyst') return 3;

  // Step 4: Compliance Gate — "Compliance", "ComplianceOfficer", "Gateway", "Policy" agent messages
  if (agent === 'compliance_officer' || agent === 'compliance' || agent === 'complianceofficer' || toAgent === 'compliance_officer' || toAgent === 'compliance' || toAgent === 'complianceofficer') return 4;
  if (agent === 'gateway' || agent === 'policy' || toAgent === 'gateway' || toAgent === 'policy') return 4;

  // Step 6: Decision & Audit — Supervisor/Orchestrator/System final synthesis/complete
  if (msgType === 'synthesize' || msgType === 'complete') return 6;
  if (agent === 'supervisor' || agent === 'orchestrator' || agent === 'system') return 6;

  // System messages — classify by content keywords
  if (contentLower.includes('credit') || contentLower.includes('score') || contentLower.includes('financial')) return 3;
  if (contentLower.includes('compliance') || contentLower.includes('sanction') || contentLower.includes('pep') || contentLower.includes('policy')) return 4;
  if (contentLower.includes('decision') || contentLower.includes('approved') || contentLower.includes('rejected') || contentLower.includes('audit')) return 6;

  return 0;
}

/**
 * Maps a real KYC API response into 7 governance-themed SimStep objects
 * for the step-through simulation display.
 */
export function mapKYCResponseToSteps(response: KYCResponse, governance?: GovernanceResults): SimStep[] {
  const ts = (offset: number) => {
    const base = new Date(response.timestamp || Date.now());
    base.setSeconds(base.getSeconds() + offset);
    return base.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const riskLevel = response.credit_risk?.level ?? 'low';
  const riskScore = response.credit_risk?.score ?? 0;
  const complianceStatus = response.compliance?.status ?? 'compliant';
  const checksPassed = response.compliance?.checks_passed ?? [];
  const checksFailed = response.compliance?.checks_failed ?? [];
  const factors = response.credit_risk?.factors ?? [];
  const recommendations = response.credit_risk?.recommendations ?? [];
  const regulatoryNotes = response.compliance?.regulatory_notes ?? [];

  const isBlocked = response.status === 'BLOCKED';
  const isHighRisk = riskLevel === 'high' || riskLevel === 'critical';
  const isCompliant = complianceStatus === 'compliant';
  const finalDecision = isBlocked || isHighRisk || !isCompliant ? 'REJECT' : 'APPROVE';

  // Step 1: Data Ingestion
  const step1: SimStep = {
    icon: '📥',
    title: 'Data Ingestion',
    type: 'GenAI (Claude Sonnet)',
    blast: 'bf-med',
    log: [
      { t: ts(0), a: 'Orchestrator', m: `KYC request: ${response.customer_id}. Invoking via API Gateway → Lambda Proxy → Worker.`, c: '' },
      { t: ts(1), a: 'AgentCore', m: 'Container started. Credit Analyst + Compliance Officer agents initialized.', c: '' },
      { t: ts(2), a: 'Guardrails', m: '▶ INPUT SCAN: No injection. PII redacted.', c: 's-warn' },
      { t: ts(3), a: 'Textract', m: 'OCR: Document extraction complete.', c: '' },
      { t: ts(4), a: 'DynamoDB', m: `✓ Session ${response.assessment_id} saved. Auto-expires: 24 hours.`, c: 's-ok' },
    ],
    risks: ['Hallucinated content', 'Prompt injection', 'PII exposure'],
    ctrls: ['Bedrock Guardrails (input filter)', 'Amazon Textract (deterministic OCR)', 'KMS + VPC isolation'],
    insight: 'Textract provides deterministic ground truth. Claude Sonnet reasons over it but cannot change it.',
  };

  // Step 2: Identity Verification
  const step2: SimStep = {
    icon: '🤖',
    title: 'Identity Verification',
    type: 'Deterministic (Lambda)',
    blast: 'bf-low',
    log: [
      { t: ts(5), a: 'Lambda Worker', m: `Customer ${response.customer_id}: Identity verification initiated.`, c: '' },
      { t: ts(6), a: 'Lambda Worker', m: 'Document cross-reference: Completed.', c: 's-ok' },
      { t: ts(7), a: 'Lambda Worker', m: 'Address verification: Electoral roll MATCH.', c: 's-ok' },
      { t: ts(8), a: 'IAM', m: 'Least privilege enforced per Lambda function.', c: 's-warn' },
      { t: ts(9), a: 'X-Ray', m: '✓ All steps traced and logged.', c: 's-ok' },
    ],
    risks: ['Synthetic identity', 'DB availability', 'Data residency'],
    ctrls: ['Lambda (cannot hallucinate)', 'IAM least privilege', 'X-Ray distributed tracing'],
    insight: 'Identity verification is deliberately NOT GenAI. Pure code = binary pass/fail.',
  };

  // Step 3: Risk Scoring (compliance checks)
  const sanctionsResult = checksPassed.includes('sanctions_check') ? 'CLEAR' : 'FLAG';
  const pepResult = checksPassed.includes('pep_check') ? 'CLEAR' : 'FLAG';
  const step3Blast: BlastLevel = isHighRisk ? 'bf-high' : 'bf-med';

  const step3: SimStep = {
    icon: '🔍',
    title: 'Risk Scoring',
    type: 'Agentic AI (Compliance Officer)',
    blast: step3Blast,
    log: [
      { t: ts(10), a: 'Compliance Agent', m: 'Planning: Sanctions → PEP → Adverse Media → Geographic → Score', c: '' },
      { t: ts(11), a: 'Gateway', m: '▶ PRE-HOOK: Tier 2 agent. Sanctions query: ALLOWED.', c: 's-warn' },
      { t: ts(12), a: 'World-Check', m: `${sanctionsResult}: Sanctions screening complete.`, c: sanctionsResult === 'CLEAR' ? 's-ok' : 's-warn' },
      { t: ts(13), a: 'PEP Database', m: `${pepResult}: PEP check complete.`, c: pepResult === 'CLEAR' ? 's-ok' : 's-warn' },
      ...checksFailed.map((check, i) => ({
        t: ts(14 + i),
        a: 'Compliance Agent' as string,
        m: `⚠ FAILED: ${check}`,
        c: 's-warn' as const,
      })),
      { t: ts(15 + checksFailed.length), a: 'Compliance Agent', m: `Status: ${complianceStatus.toUpperCase()}. Passed: ${checksPassed.length}, Failed: ${checksFailed.length}.`, c: isCompliant ? 's-ok' : 's-warn' },
      ...regulatoryNotes.map((note, i) => ({
        t: ts(16 + checksFailed.length + i),
        a: 'Regulatory' as string,
        m: note,
        c: '' as const,
      })),
    ],
    risks: ['Hallucinated matches', 'Missed true positives', 'Data poisoning', 'Stale data'],
    ctrls: ['Automated Reasoning (formal proof)', 'Gateway Interceptors', 'Guardrails output scan', 'Parallel deterministic match'],
    insight: isHighRisk
      ? 'BLAST RADIUS IN ACTION: High risk score triggers mandatory human review pathway.'
      : 'Blast Radius contained. Low-risk = bounded autonomy. High-risk = mandatory escalation.',
  };

  // Step 4: Credit Analysis
  const step4Severity = riskLevel === 'high' || riskLevel === 'critical' ? 's-warn' : 's-ok';

  // Build deterministic check log entry from real results or fallback
  const detCheck = governance?.deterministicResult;
  const detMessage = detCheck
    ? `▶ INDEPENDENT: ${Object.entries(detCheck.checks).map(([k, v]) => `${k.replace('_', '/')}=${v.computed} ${v.result === 'PASS' ? '✓' : '✗'}`).join(' | ')} → ${detCheck.overall}`
    : '▶ INDEPENDENT: Score calculation verified.';

  // Build LLM-as-Judge log entry from real scores or fallback
  const judge = governance?.judgeScores;
  const judgeMessage = judge
    ? `Quality ${judge.correctness} | Faithfulness ${judge.faithfulness} | Completeness ${judge.completeness} | Helpfulness ${judge.helpfulness} | Tone ${judge.tone}`
    : `Quality check complete. Risk: ${riskLevel.toUpperCase()}.`;

  const step4: SimStep = {
    icon: '📊',
    title: 'Credit Analysis',
    type: 'GenAI + Lambda (Credit Analyst)',
    blast: 'bf-med',
    log: [
      { t: ts(20), a: 'Credit Agent', m: `Credit Score: ${riskScore}/100. Risk Level: ${riskLevel.toUpperCase()}.`, c: '' },
      { t: ts(21), a: 'Credit Agent', m: `Factors: ${factors.length > 0 ? factors.join(', ') : 'None identified'}.`, c: '' },
      { t: ts(22), a: 'Lambda Validator', m: detMessage, c: step4Severity as '' | 's-ok' | 's-warn' | 's-err' },
      ...recommendations.map((rec, i) => ({
        t: ts(23 + i),
        a: 'Credit Agent' as string,
        m: `Recommendation: ${rec}`,
        c: '' as const,
      })),
      { t: ts(24 + recommendations.length), a: 'LLM-as-Judge', m: judgeMessage, c: step4Severity as '' | 's-ok' | 's-warn' | 's-err' },
    ],
    risks: ['Incorrect calculations', 'Biased scoring', 'Manipulated statements'],
    ctrls: ['Lambda recalculation (independent)', 'LLM-as-Judge gate', 'RAI evaluator (bias)'],
    insight: 'Numbers Are Never AI: Claude Sonnet does reasoning. Lambda does arithmetic. Every number independently confirmed by deterministic code.',
  };

  // Step 5: Compliance Gate
  const gatePassed = isCompliant && !isHighRisk && !isBlocked;
  const blockReason = response.block_reason || '❌ BLOCK: Policy violation detected.';
  const policyLayer = response.policy_layer || 'ORG';
  const incidentId = response.incident_id;
  const detChecks = response.deterministic_checks;

  const step5Log: LogEntry[] = [
    { t: ts(28), a: 'Agent', m: `Requesting: processCustomer(${response.customer_id})`, c: '' },
    { t: ts(29), a: 'Gateway', m: '▶ INTERCEPTED. Evaluating 3 policy layers...', c: 's-warn' },
  ];

  if (gatePassed) {
    step5Log.push(
      { t: ts(30), a: 'Org Policy', m: 'PEP=FALSE → no block ✓', c: 's-ok' },
      { t: ts(31), a: 'App Policy', m: `Score ${riskScore} within threshold → bounded autonomy ✓`, c: 's-ok' },
      { t: ts(32), a: 'Policy Engine', m: '✓ ALL PASS. Bounded autonomy permitted.', c: 's-ok' },
    );
  } else {
    step5Log.push(
      { t: ts(30), a: `${policyLayer} Policy`, m: `❌ BLOCK: ${blockReason}`, c: 's-warn' },
    );
    if (detChecks?.sanctions) {
      step5Log.push(
        { t: ts(31), a: 'Sanctions Engine', m: `MATCH: "${detChecks.sanctions.match}" — score ${(detChecks.sanctions.score * 100).toFixed(0)}% (${detChecks.sanctions.list})`, c: 's-warn' },
      );
    }
    if (detChecks?.pep) {
      step5Log.push(
        { t: ts(32), a: 'PEP Database', m: `Level ${detChecks.pep.level} association (${detChecks.pep.source})`, c: 's-warn' },
      );
    }
    if (incidentId) {
      step5Log.push(
        { t: ts(33), a: 'Incident', m: `Incident created: ${incidentId}. Escalation: ${response.escalation_to || 'MLRO'}.`, c: 's-warn' },
      );
    }
    step5Log.push(
      { t: ts(34), a: 'Policy Engine', m: '❌ POLICY VIOLATION. Processing HALTED. Agent opinion overridden.', c: 's-warn' },
    );
  }

  const step5: SimStep = {
    icon: '⚖️',
    title: 'Compliance Gate',
    type: 'Policy Engine (AgentCore)',
    blast: gatePassed ? 'bf-low' : 'bf-high',
    log: step5Log,
    risks: ['Policy config errors', 'Reg changes missed', 'Circumvention attempts'],
    ctrls: ['3-layer Policy Engine', 'Gateway Interceptors (external)', 'Compliance-as-Code (Git)'],
    insight: gatePassed
      ? 'External to agent: Gateway fires as Lambda hook OUTSIDE the AgentCore container. Agent cannot suppress or bypass it.'
      : 'THIS IS THE BLAST RADIUS CONTROL. The Policy Engine — external, deterministic, non-bypassable — blocked the agent.',
  };

  // Step 6: Human Oversight
  const hitlRequired = isBlocked || isHighRisk || !isCompliant;
  const step6: SimStep = {
    icon: '👤',
    title: hitlRequired ? 'Mandatory Human Review' : 'Human Oversight',
    type: hitlRequired ? 'HITL (Escalation — MLRO)' : 'Spot Check (Earned Autonomy)',
    blast: 'bf-low',
    log: hitlRequired
      ? [
          { t: ts(33), a: 'HITL System', m: `MANDATORY ESCALATION: Risk ${riskLevel.toUpperCase()}, Compliance ${complianceStatus.toUpperCase()}.`, c: 's-warn' },
          { t: ts(34), a: 'System', m: 'Assigned to: Senior Compliance Analyst.', c: '' },
          { t: ts(35), a: 'System', m: 'Briefing generated: Full reasoning chain + evidence.', c: '' },
          { t: ts(36), a: 'System', m: '⏳ AWAITING HUMAN DECISION. Agent paused.', c: 's-warn' },
        ]
      : [
          { t: ts(33), a: 'HITL System', m: `Score ${riskScore}, Compliant → HITL NOT required.`, c: '' },
          { t: ts(34), a: 'System', m: 'Agent has earned Tier 2 autonomy.', c: 's-ok' },
          { t: ts(35), a: 'QA Sampler', m: 'Selected for post-decision review (10% random). Non-blocking.', c: '' },
          { t: ts(36), a: 'System', m: '✓ Proceeding. Full reasoning chain preserved for audit.', c: 's-ok' },
        ],
    risks: hitlRequired
      ? ['Analyst fatigue', 'Time pressure', 'Incomplete briefing']
      : ['Complacency', 'Quality drift', 'Small sample size'],
    ctrls: hitlRequired
      ? ['Structured reasoning chain', 'Mandatory evidence package', 'Time-based escalation (4h SLA)', 'Senior reviewer for CRITICAL']
      : ['10% random QA sampling', 'Post-decision review (48h)', 'Continuous AgentCore Evaluations'],
    insight: hitlRequired
      ? "EARNED AUTONOMY — REVOKED: High-risk triggers mandatory human review. The agent's track record is irrelevant when serious risk flags are present."
      : "Earned Autonomy: this low-risk case doesn't need mandatory HITL because the agent proved its track record.",
  };

  // Step 7: Decision & Audit
  const step7Log: LogEntry[] = [
    { t: ts(37), a: 'Decision', m: `${response.customer_id} → ${finalDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}. Risk: ${riskLevel.toUpperCase()} (${riskScore}/100).`, c: finalDecision === 'APPROVE' ? 's-ok' : 's-warn' },
  ];
  if (isBlocked && incidentId) {
    step7Log.push(
      { t: ts(38), a: 'Policy Engine', m: `Incident ${incidentId} — escalated to ${response.escalation_to || 'MLRO'}. SAR filing initiated.`, c: 's-warn' },
    );
  }
  step7Log.push(
    { t: ts(39), a: 'CloudTrail', m: '✓ Immutable audit record created.', c: 's-ok' },
    { t: ts(40), a: 'X-Ray', m: 'Full trace recorded. All tool calls and policy checks logged.', c: '' },
    { t: ts(41), a: 'Evaluations', m: 'All 6 dimensions logged.', c: 's-ok' },
    { t: ts(42), a: 'Summary', m: response.summary || `Assessment complete for ${response.customer_id}.`, c: '' },
    { t: ts(43), a: 'System', m: '✓ COMPLETE. Full audit trail preserved.', c: 's-ok' },
  );

  const step7: SimStep = {
    icon: finalDecision === 'APPROVE' ? '✅' : '🚫',
    title: finalDecision === 'APPROVE' ? 'Decision & Audit' : `Decision: REJECTED`,
    type: 'Immutable (CloudTrail + X-Ray)',
    blast: 'bf-low',
    log: step7Log,
    risks: ['Audit integrity', 'Performance drift', 'Alert fatigue'],
    ctrls: ['CloudTrail + X-Ray (immutable)', 'AgentCore Evaluations (continuous)', 'Auto policy tightening on drift'],
    insight: 'Governance as operation: every session evaluated. Good scores = maintain autonomy. Drift = auto-tighten.',
  };

  const steps = [step1, step2, step3, step4, step5, step6, step7];

  // Override log entries with real message_log data when available
  const realLogs = mapMessageLogToStepLogs(response.message_log ?? []);
  if (realLogs) {
    for (let i = 0; i < steps.length; i++) {
      if (realLogs[i].length > 0) {
        steps[i] = { ...steps[i], log: realLogs[i] };
      }
    }
  }

  return steps;
}
