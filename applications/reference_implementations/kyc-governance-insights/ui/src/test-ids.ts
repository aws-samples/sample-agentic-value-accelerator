// Centralized data-testid constants — shared between source and Playwright tests
// Hierarchical: domain.component.element

export const TEST_IDS = {
  // Persona selector
  persona: {
    selector: 'persona.selector',
    option: (name: string) => `persona.option.${name}`,
    selected: 'persona.selected',
  },
  // Navigation
  nav: {
    tabBar: 'nav.tab-bar',
    tab: (id: string) => `nav.tab.${id}`,
  },
  // CRO Fleet
  fleet: {
    heroCard: 'fleet.hero-card',
    simulationModal: 'fleet.simulation-modal',
    modalClose: 'fleet.modal-close',
    riskAppetite: 'fleet.risk-appetite',
    trendChart: 'fleet.trend-chart',
    incidentLog: 'fleet.incident-log',
    boardPack: 'fleet.board-pack',
    constellation: 'fleet.constellation',
  },
  // Constellation
  constellation: {
    container: 'constellation.container',
    node: (name: string) => `constellation.node.${name}`,
    detail: 'constellation.detail',
  },
  // Simulation
  simulation: {
    container: 'simulation.container',
    manualBar: 'simulation.manual-bar',
    headlineStat: 'simulation.headline-stat',
    stepDetail: 'simulation.step-detail',
  },
  // Presentation Mode
  presentation: {
    trigger: 'presentation.trigger',
    nextBtn: 'presentation.next',
    prevBtn: 'presentation.prev',
    notes: 'presentation.notes',
    beatDot: (n: number) => `presentation.beat.${n}`,
  },
  // Governance & Cedar
  governance: {
    container: 'governance.container',
    frameworkSelector: 'governance.framework-selector',
    controlGrid: 'governance.control-grid',
    cedarTab: 'governance.cedar-tab',
    cedarPolicy: (id: string) => `governance.cedar-policy.${id}`,
    whatIfToggle: (id: string) => `governance.what-if.${id}`,
    decisionTrace: 'governance.decision-trace',
  },
  // Risk Register & Control Bucketing
  riskRegister: {
    container: 'risk-register.container',
    frameworkToggle: (fw: string) => `risk-register.framework.${fw}`,
    statusFilter: (status: string) => `risk-register.filter.${status}`,
    searchInput: 'risk-register.search',
    matchCounter: 'risk-register.match-counter',
    categoryAccordion: (cat: string) => `risk-register.category.${cat}`,
  },
  // Architecture
  architecture: {
    container: 'architecture.container',
    securityScore: 'architecture.security-score',
    threatHeatmap: 'architecture.threat-heatmap',
    multiModelChain: 'architecture.multi-model-chain',
    requestFlow: 'architecture.request-flow',
    resiliencePanel: 'architecture.resilience-panel',
  },
  // Compliance & Audit
  compliance: {
    container: 'compliance.container',
    modelInventory: 'compliance.model-inventory',
    controlTesting: 'compliance.control-testing',
    smcrMap: 'compliance.smcr-map',
    smcrAttestations: 'compliance.smcr-attestations',
    issuesTracker: 'compliance.issues-tracker',
    compositeScore: 'compliance.composite-score',
  },
  // Business Ops
  businessOps: {
    container: 'business-ops.container',
    kpiCards: 'business-ops.kpi-cards',
    kpiCard: (id: string) => `business-ops.kpi.${id}`,
    slaMonitor: 'business-ops.sla-monitor',
  },
  // ROI Projection
  roi: {
    container: 'roi.container',
    slider: (id: string) => `roi.slider.${id}`,
    scenarioCard: (type: string) => `roi.scenario.${type}`,
    beforeAfterTable: 'roi.before-after-table',
  },
  // Observability / Decision Traces
  observability: {
    container: 'observability.container',
    waterfall: 'observability.waterfall',
    kpiCards: 'observability.kpi-cards',
    traceSelector: 'observability.trace-selector',
  },
  // HITL / Review Queue
  hitl: {
    container: 'hitl.container',
    pendingDecisions: 'hitl.pending-decisions',
    slaTimer: 'hitl.sla-timer',
    reviewItem: (id: string) => `hitl.review-item.${id}`,
  },
  // Audit & Evidence
  audit: {
    container: 'audit.container',
    evidencePack: 'audit.evidence-pack',
    completenessScore: 'audit.completeness-score',
  },
  // QA Research Agent
  qa: {
    container: 'qa.container',
    rubricCard: (dimension: string) => `qa.rubric.${dimension}`,
  },
  // Report Generation
  report: {
    generateBtn: 'report.generate-btn',
    reportContainer: 'report.container',
  },
  // Live Metrics
  metrics: {
    container: 'metrics.container',
    badge: 'metrics.badge',
  },
  // Security & Resilience
  security: {
    container: 'security.container',
    interventionLadder: 'security.intervention-ladder',
    attackSurfaces: 'security.attack-surfaces',
  },
  // KYC Report
  kycReport: {
    container: 'kyc-report.container',
  },
  // Overview
  overview: {
    container: 'overview.container',
    evidenceTrail: 'overview.evidence-trail',
  },
} as const;
