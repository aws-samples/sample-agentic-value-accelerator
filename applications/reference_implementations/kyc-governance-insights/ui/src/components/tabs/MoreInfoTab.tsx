import React from 'react';

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: '12px',
  padding: '1.5rem',
  marginBottom: '1.5rem',
};

const h2Style: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 1rem 0',
};

const pStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.7,
  margin: '0 0 0.75rem 0',
};

const liStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.7,
  marginBottom: '0.5rem',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  textDecoration: 'none',
};

const implementationStatus = [
  { feature: 'Amazon Bedrock inference', status: '✅ Live' },
  { feature: 'Bedrock Guardrails (input + output + grounding)', status: '✅ Live' },
  { feature: 'AgentCore Runtime + Gateway', status: '✅ Live' },
  { feature: 'Lambda deterministic validators', status: '✅ Live' },
  { feature: 'LLM-as-Judge evaluation', status: '✅ Live' },
  { feature: 'DynamoDB Agent Registry', status: '✅ Live' },
  { feature: 'CloudWatch + X-Ray observability', status: '✅ Live' },
  { feature: 'LangGraph orchestration', status: '✅ Live' },
  { feature: 'IAM least-privilege roles', status: '✅ Live' },
  { feature: 'Bedrock Automated Reasoning', status: '⚗️ Experimental' },
  { feature: 'Amazon Verified Permissions (Policy Engine)', status: '🔜 Planned' },
  { feature: 'AgentCore Evaluations (custom)', status: '🔜 Planned' },
  { feature: 'Step Functions HITL workflow', status: '🔜 Planned' },
  { feature: 'Continuous auto-tighten policy', status: '🔜 Planned' },
  { feature: 'Full Scope 3 autonomous operation', status: '🔜 Planned' },
];

export const MoreInfoTab: React.FC = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Section 1 */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>What is this?</h2>
        <p style={pStyle}>
          This console demonstrates end-to-end AI governance controls for a KYC (Know Your Customer) use case
          in financial services. It shows how autonomous AI agents can be safely deployed with layered controls
          that earn progressively greater autonomy.
        </p>
      </div>

      {/* Section 2 */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>How to read this demo</h2>
        <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
          <li style={liStyle}><strong>Overview</strong> → The big picture (what agents, what outcome)</li>
          <li style={liStyle}><strong>Agent Execution</strong> → Watch the agent work in real-time, see controls fire at each step</li>
          <li style={liStyle}><strong>Lifecycle</strong> → Understand each processing stage and what governs it</li>
          <li style={liStyle}><strong>Risk Register</strong> → All risks mapped to their mitigating controls</li>
          <li style={liStyle}><strong>Architecture</strong> → What's deployed, what's experimental, what AWS services power it</li>
          <li style={liStyle}><strong>Governance</strong> → Continuous evaluation metrics and agent registry</li>
          <li style={liStyle}><strong>KYC Report</strong> → The actual output delivered to a compliance officer</li>
        </ul>
      </div>

      {/* Section 3 */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Principles</h2>
        <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
          <li style={liStyle}>Greater autonomy is earned through ongoing evaluation</li>
          <li style={liStyle}>Every agent action passes through deterministic gates before reaching customers</li>
          <li style={liStyle}>Policy Engine limits blast radius — an inaccurate £5K claim is a complaint; an inaccurate £150K claim is a regulatory event</li>
          <li style={liStyle}>Human-in-the-loop is surgical, not universal ("HITL isn't the gold standard… use it judiciously")</li>
          <li style={liStyle}>Start supervised (Scope 2), earn autonomous (Scope 3) through demonstrated control effectiveness</li>
        </ul>
      </div>

      {/* Section 4 */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Sources & References</h2>
        <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
          <li style={liStyle}><a href="https://aws.amazon.com/ai/security/agentic-ai-scoping-matrix/" target="_blank" rel="noopener noreferrer" style={linkStyle}>AWS Agentic AI Scoping Matrix</a></li>
          <li style={liStyle}><a href="https://aws.amazon.com/blogs/machine-learning/operationalizing-agentic-ai-part-1-a-stakeholders-guide/" target="_blank" rel="noopener noreferrer" style={linkStyle}>Operationalizing Agentic AI Part 1</a></li>
          <li style={liStyle}><a href="https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/" target="_blank" rel="noopener noreferrer" style={linkStyle}>Evaluating AI Agents</a></li>
          <li style={liStyle}><a href="https://aws.amazon.com/blogs/devops/multi-agent-collaboration-with-strands/" target="_blank" rel="noopener noreferrer" style={linkStyle}>Multi-Agent Collaboration with Strands</a></li>
          <li style={liStyle}><a href="https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-operationalizing-agentic-ai/focus-areas-trust.html" target="_blank" rel="noopener noreferrer" style={linkStyle}>Focus Areas — Trust</a></li>
          <li style={liStyle}><a href="https://aws.amazon.com/blogs/security/security-principles-for-agentic-ai-on-aws/" target="_blank" rel="noopener noreferrer" style={linkStyle}>FSI Agentic Security (7 Principles)</a></li>
          <li style={liStyle}><a href="https://aws.amazon.com/blogs/apn/architecting-agentic-ai-for-scale-and-trust-from-the-start/" target="_blank" rel="noopener noreferrer" style={linkStyle}>PwC + AWS Trust Architecture</a></li>
        </ul>
      </div>

      {/* Section 5 */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Implementation Status</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Feature</th>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {implementationStatus.map((row) => (
              <tr key={row.feature}>
                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{row.feature}</td>
                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MoreInfoTab;
