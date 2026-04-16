import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const discoverySteps = [
  {
    title: 'Define the Goal and Set Guardrails',
    description:
      'Start by defining the outcomes that matter most, such as lower cost, reduced losses, faster cycle times, lower risk, or better customer experience. Just as important, be clear about what the system should not do, especially in areas where unsupervised decisions could affect customers, patients, employees, or partners. Set these boundaries early through strong governance, clear policies, and executive oversight.',
    icon: 'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5',
  },
  {
    title: 'Map the Full Process',
    description:
      'Look at the entire workflow, not just individual tasks. Agentic AI tends to deliver the most value in broken or fragmented processes where people switch between case tools, document repositories, communication channels, and core systems. Common opportunities appear across industries — compliance, customer service, underwriting, care coordination, supply chain management, and back office operations — but prioritization is essential.',
    icon: 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z',
  },
  {
    title: 'Identify Friction and Measure the Baseline',
    description:
      'Focus first on processes with clear pain points, such as high exception rates, repeated rework, slow decisions, large volumes of unstructured content, or costly delays. Establish a baseline before making changes so you can measure improvement in a meaningful way.',
    icon: 'M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z',
  },
  {
    title: 'Confirm That an Agent Is Really Needed',
    description:
      'A use case is a strong fit for agentic AI when it requires at least two of these capabilities: multi-step reasoning, dynamic tool selection across systems, iterative investigation, or branching based on exceptions. If the work is repetitive, rules-based, and predictable, traditional workflow automation or RPA is usually a better choice.',
    icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
  },
  {
    title: 'Check Data Readiness',
    description:
      'Success depends on having the right data, not just more data. The data should be clean, complete, standardized, and tied to clear lineage, access controls, and permissions. Data quality, privacy, security, and governance all need to be addressed before moving forward. This applies whether you are working with financial records, medical data, customer transactions, or operational telemetry.',
    icon: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
  },
  {
    title: 'Define Tool Access and Safe Actions',
    description:
      'List every system the agent would need to access, such as case management, CRM, ERP, core platforms, document management, or ticketing tools. For each one, define what actions are allowed, what requires approval, what should be logged, and what level of access is truly necessary. Least-privilege access is critical when AI can take action inside business systems.',
    icon: 'M11.42 15.17l-5.1-5.1m0 0l5.1-5.1m-5.1 5.1h12.76m-12.76 0H3.75m7.67 5.1l5.1-5.1m0 0l-5.1-5.1m5.1 5.1H8.24',
  },
  {
    title: 'Account for Business and Regulatory Constraints',
    description:
      'Some use cases require extra caution from the start. This includes decisions that directly affect eligibility, pricing, approvals, or outcomes for customers or stakeholders, situations that require clear explanations or notices, and areas where discrimination, fairness, or safety concerns may arise. In these cases, human review, stronger controls, and documented reasoning are often necessary.',
    icon: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z',
  },
  {
    title: 'Set Success Metrics and Acceptance Criteria',
    description:
      'Define success before launching the pilot. Metrics might include cycle time, cost per case, first-contact resolution, false positives or false negatives, complaint rates, escalation rates, and action error rates such as incorrect system updates or missed exceptions. Clear pre- and post-pilot measures make it easier to evaluate performance, manage risk, and decide whether to scale.',
    icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  },
];

const prioritizationCategories = [
  {
    name: 'Business Value',
    accent: 'from-blue-500 to-blue-600',
    accentBg: 'bg-blue-500',
    accentLight: 'bg-blue-50',
    accentText: 'text-blue-700',
    accentBorder: 'border-blue-200',
    icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
    highlights: ['Clear ROI potential', 'Cost reduction', 'CX improvements'],
    description:
      'Whether the use case can deliver meaningful, measurable impact. It includes clear ROI potential through lower operating costs, reduced losses, or higher productivity, supported by a baseline that can be tracked over time and owned by a specific business leader. It also includes customer and employee experience improvements, especially where the use case can improve speed, quality, or consistency in a high volume journey.',
  },
  {
    name: 'Process Fit',
    accent: 'from-teal-500 to-teal-600',
    accentBg: 'bg-teal-500',
    accentLight: 'bg-teal-50',
    accentText: 'text-teal-700',
    accentBorder: 'border-teal-200',
    icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    highlights: ['Multi-step coordination', 'Exception handling', 'Cross-system orchestration'],
    description:
      'Whether the work is a strong match for agentic AI rather than simpler automation. The best candidates usually involve multi-step coordination across several systems, tools, or data sources, where the work requires orchestration instead of a single linear task. When exceptions are frequent and the workflow does not follow the same path every time, rules-based automation often falls short, making agentic AI a stronger fit.',
  },
  {
    name: 'Feasibility',
    accent: 'from-amber-500 to-amber-600',
    accentBg: 'bg-amber-500',
    accentLight: 'bg-amber-50',
    accentText: 'text-amber-700',
    accentBorder: 'border-amber-200',
    icon: 'M11.42 15.17l-5.1-5.1a1.5 1.5 0 010-2.12l.88-.88a1.5 1.5 0 012.12 0l2.93 2.93 5.1-5.1a1.5 1.5 0 012.12 0l.88.88a1.5 1.5 0 010 2.12l-7.17 7.17a1.5 1.5 0 01-2.12 0h-.04z',
    highlights: ['Data quality', 'API availability', 'Least-privilege access'],
    description:
      'Whether the organization can realistically implement the use case in a safe and reliable way. A strong candidate starts with data that is high quality, well governed, and clearly traceable, with the right permissions and provenance in place. It also depends on integration practicality, including whether the necessary APIs exist, whether secure tool access can be established, and whether least-privilege access can be enforced.',
  },
  {
    name: 'Risk and Compliance',
    accent: 'from-red-500 to-red-600',
    accentBg: 'bg-red-500',
    accentLight: 'bg-red-50',
    accentText: 'text-red-700',
    accentBorder: 'border-red-200',
    icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    highlights: ['Auditability', 'Explainability', 'Limited operational risk'],
    description:
      'Whether the use case can be managed safely within the organization\'s control framework. Strong candidates typically have limited operational risk, such as read-only tasks or actions that can be reversed easily, with clear fallback options. They also need model outputs that can be validated, explained, and tied to supporting evidence. The use case should support full auditability, including traceability of prompts, tool calls, inputs, outputs, approvals, and retention.',
  },
  {
    name: 'Time to Value',
    accent: 'from-emerald-500 to-emerald-600',
    accentBg: 'bg-emerald-500',
    accentLight: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    accentBorder: 'border-emerald-200',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    highlights: ['8-12 week pilot', 'Team readiness', 'Budget availability'],
    description:
      'How quickly the organization can move from idea to measurable results. A strong use case is one that can be piloted within 8 to 12 weeks using real users, real data, and clear business KPIs. This also tests practical readiness, including whether the right people, budget, technology support, and governance capacity are already in place.',
  },
];

const stepColors = [
  'from-blue-500 to-blue-600',
  'from-blue-600 to-indigo-500',
  'from-indigo-500 to-indigo-600',
  'from-indigo-600 to-violet-500',
  'from-violet-500 to-violet-600',
  'from-violet-600 to-purple-500',
  'from-purple-500 to-purple-600',
  'from-purple-600 to-fuchsia-500',
];

const agenticFlowSteps = [
  { num: 1, title: 'Accept Objective', detail: 'Explicit or inferred', icon: 'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3' },
  { num: 2, title: 'Produce Plan', detail: 'Sequence of steps', icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z' },
  { num: 3, title: 'Invoke Tools', detail: 'APIs, workflows, databases', icon: 'M11.42 15.17l-5.1-5.1m0 0l5.1-5.1m-5.1 5.1h12.76m-12.76 0H3.75m7.67 5.1l5.1-5.1m0 0l-5.1-5.1m5.1 5.1H8.24' },
  { num: 4, title: 'Iterate', detail: 'Using tool outputs', icon: 'M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3' },
  { num: 5, title: 'Complete with Autonomy', detail: 'Under governance & oversight', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const principles = [
  {
    title: 'Bounded Autonomy',
    description: 'Autonomy must be bounded, and oversight must be present. In regulated and high-stakes environments, this is what distinguishes enterprise agentic AI from consumer experimentation.',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    gradient: 'from-blue-500 to-indigo-600',
    light: 'from-blue-50 to-indigo-50',
  },
  {
    title: 'Measurable Outcomes',
    description: 'Focus investment on outcomes that matter rather than on novelty. Every use case should tie to a measurable business outcome owned by a specific leader.',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    gradient: 'from-indigo-500 to-violet-600',
    light: 'from-indigo-50 to-violet-50',
  },
  {
    title: 'Low-Regret Reversibility',
    description: 'Start with use cases where outputs can be validated, actions can be reversed, and fallback options are clear if something goes wrong.',
    icon: 'M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3',
    gradient: 'from-violet-500 to-purple-600',
    light: 'from-violet-50 to-purple-50',
  },
];

// Reusable AnimatedSection component
function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Section header component for consistency
function SectionHeader({ title, subtitle, number }: { title: string; subtitle?: string; number?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        {number && (
          <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full tracking-wider uppercase">
            {number}
          </span>
        )}
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h2>
      </div>
      {subtitle && (
        <p className="text-sm text-slate-500 leading-relaxed max-w-3xl ml-0.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default function Strategy() {
  const navigate = useNavigate();
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]));
  const [timelineVisible, setTimelineVisible] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimelineVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (timelineRef.current) {
      observer.observe(timelineRef.current);
    }

    return () => {
      if (timelineRef.current) {
        observer.unobserve(timelineRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-12">
        {/* Hero Header */}
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-medium text-blue-600 mb-5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            Practical Framework for Enterprise Leaders
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4 leading-tight">
            Accelerator Guide
          </h1>
          <p className="text-lg text-slate-500 max-w-3xl mx-auto leading-relaxed">
            Agentic AI is moving fast from concept to production across industries. The hard question isn't whether to adopt agentic AI — it's <em className="text-slate-600 not-italic font-medium">where to start</em>, and how to choose use cases that deliver measurable business value without creating new risk exposure.
          </p>
        </div>

        {/* Section 1: What is Agentic AI? - Flow */}
        <AnimatedSection className="mb-20">
          <SectionHeader
            number="01"
            title="What is Agentic AI?"
            subtitle="An AI-enabled system that operates through five connected stages with bounded autonomy under governance, logging, and human oversight."
          />

          <div className="relative">
            {/* Connection line behind cards */}
            <div className="hidden md:block absolute top-1/2 left-8 right-8 h-px bg-gradient-to-r from-blue-200 via-indigo-200 to-violet-200 -translate-y-1/2 z-0" />

            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              {agenticFlowSteps.map((step, idx) => (
                <div
                  key={step.num}
                  className="group relative z-10"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden h-full">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <div className="relative">
                      <div className="flex items-center justify-center mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                          </svg>
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Step {step.num}</span>
                        <h3 className="text-sm font-semibold text-slate-900 mt-1 mb-1.5">
                          {step.title}
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* Section 2: Three Guiding Principles */}
        <AnimatedSection className="mb-20">
          <SectionHeader
            number="02"
            title="Three Guiding Principles"
            subtitle="Leaders should anchor agentic AI selection in these three principles across business, technology, and risk functions."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {principles.map((p, idx) => (
              <div key={p.title} className="group relative" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="bg-white rounded-2xl border border-slate-200 p-7 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full relative overflow-hidden">
                  {/* Subtle gradient overlay on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${p.light} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                  <div className="relative">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${p.gradient} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">{p.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{p.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* Section 3: Recommendations for Leaders */}
        <AnimatedSection className="mb-20">
          <SectionHeader
            number="03"
            title="Recommendations for Leaders"
            subtitle="Practical guidance for business, technology, and risk leaders adopting agentic AI."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Business Leaders */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-600" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <svg className="w-5.5 h-5.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">Business Leaders</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Use these principles to focus investment on outcomes that matter rather than on novelty. Whether the goal is reducing processing time, improving visibility, or accelerating onboarding, the use case must tie to a measurable business outcome owned by a specific leader.
                </p>
              </div>
            </div>

            {/* Technology Leaders */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="h-1.5 bg-gradient-to-r from-violet-500 to-violet-600" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                    <svg className="w-5.5 h-5.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">Technology Leaders</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Adopt or build a reusable agent platform layer, for example Amazon Bedrock AgentCore on AWS, that centralizes identity and access controls, tool gateways, logging, evaluation harnesses, and controls. Governance and security should be systemic platform properties, not use-case-by-use-case afterthoughts.
                </p>
              </div>
            </div>

            {/* Risk Leaders */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="h-1.5 bg-gradient-to-r from-red-500 to-red-600" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                    <svg className="w-5.5 h-5.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">Risk Leaders</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Extend existing model risk and operational risk practices to include agent-specific behaviors such as action approval points, tool-risk tiers, and provenance. Agentic toolchains and autonomy require the same discipline applied to a broader surface area.
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* Section 4: 8-Step Discovery Process */}
        <AnimatedSection className="mb-20">
          <SectionHeader
            number="04"
            title="8-Step Discovery Process"
            subtitle="Click each step to expand its details."
          />

          <div className="relative" ref={timelineRef}>
            {/* Vertical timeline line */}
            <div className="hidden md:block absolute left-[1.4rem] top-6 bottom-6 w-0.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-500 w-full origin-top"
                style={{
                  height: timelineVisible ? '100%' : '0%',
                  transitionDuration: '2500ms',
                  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>

            <div className="space-y-3">
              {discoverySteps.map((step, i) => {
                const isOpen = expandedSteps.has(i);
                return (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden relative hover:border-slate-300 transition-all duration-300"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleStep(i)}
                      className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stepColors[i]} text-white text-sm font-bold flex items-center justify-center flex-shrink-0 relative z-10 transition-all duration-300 shadow-sm ${
                          isOpen ? 'shadow-lg scale-110' : ''
                        }`}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-800">{step.title}</span>
                      </div>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isOpen ? 'bg-blue-50 rotate-180' : 'bg-slate-50'}`}>
                        <svg
                          className={`w-4 h-4 transition-colors duration-300 ${isOpen ? 'text-blue-500' : 'text-slate-400'}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-400 ease-in-out ${
                        isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-5 pb-5 pl-[4.75rem]">
                        <div className="flex gap-4">
                          <div className="hidden md:flex w-10 h-10 rounded-xl bg-slate-50 items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                            </svg>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AnimatedSection>

        {/* Section 5: Prioritization Framework */}
        <AnimatedSection className="mb-20">
          <SectionHeader
            number="05"
            title="Prioritization Framework"
            subtitle="A practical framework that prevents hype-first decision-making and treats risk as a core decision factor. Every enterprise's risk tolerance is different, so your weights for each category will differ."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {prioritizationCategories.map((cat, idx) => (
              <PriorityCard key={cat.name} category={cat} delay={idx * 100} />
            ))}
          </div>
        </AnimatedSection>

        {/* Section 6: Getting Started */}
        <AnimatedSection className="mb-12">
          <SectionHeader
            number="06"
            title="Getting Started"
          />

          <div className="bg-white rounded-2xl border border-slate-200 p-8 mb-8">
            <div className="max-w-4xl">
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                The enterprises moving fastest on agentic AI aren't the ones chasing the most ambitious use cases. They're the ones being disciplined about selection — grounding decisions in measurable outcomes, matching autonomy to risk, and building on a reusable platform layer that makes governance systemic rather than situational.
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                Use the steps and framework above to build a shortlist of candidate use cases, then pressure test each one against the five prioritization categories. The goal isn't to find a single perfect starting point. It's to build a portfolio where business value, feasibility, and risk posture are all understood before pilots begin, and where the lessons from early wins can scale across your enterprise.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-2">Ready to build?</h3>
                <p className="text-blue-100 text-sm leading-relaxed max-w-lg">
                  Explore pre-built agentic AI applications or browse full-stack reference solutions to accelerate your journey.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => navigate('/applications/fsi-foundry')}
                  className="px-6 py-3 bg-white text-blue-600 text-sm font-semibold rounded-xl hover:bg-blue-50 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                >
                  Browse Use Cases
                </button>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}

// Priority Card Component
function PriorityCard({ category, delay }: { category: typeof prioritizationCategories[0]; delay: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className={`h-1.5 bg-gradient-to-r ${category.accent}`} />
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-11 h-11 rounded-xl ${category.accentLight} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
            <svg className={`w-5.5 h-5.5 ${category.accentText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={category.icon} />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900">{category.name}</h3>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-5">{category.description}</p>

        <div className="flex flex-wrap gap-1.5 pt-4 border-t border-slate-100">
          {category.highlights.map(h => (
            <span key={h} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${category.accentLight} ${category.accentText} tracking-wide`}>{h}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
