import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { UserProvider } from './contexts/UserContext';
import SignIn from './components/SignIn';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import PlanLanding from './components/PlanLanding';
import Prioritization from './components/Prioritization';
import MaturityAssessment from './components/MaturityAssessment';
import OperatingModel from './components/OperatingModel';
import BusinessCases from './components/BusinessCases';
import OrganizationDesignPage from './components/OrganizationDesign';
import TemplateCatalog from './components/TemplateCatalog';
import DeploymentList from './components/DeploymentList';
import DeploymentCreate from './components/DeploymentCreate';
import DeploymentDetail from './components/DeploymentDetail';
import Documentation from './components/Documentation';
import FSIFoundryCatalog from './components/FSIFoundryCatalog';
import ReferenceImplementations from './components/ReferenceImplementations';
import AppDeployCreate from './components/AppDeployCreate';
import RefImplDeployCreate from './components/RefImplDeployCreate';
import Observability from './components/Observability';
import ObservabilityLanding from './components/ObservabilityLanding';
import AgentCoreObservability from './components/AgentCoreObservability';
import Guardrails from './components/Guardrails';
import Policy from './components/Policy';
import LLMGateway from './components/LLMGateway';
import AppFactory from './components/AppFactory';
import ApplicationsLanding from './components/ApplicationsLanding';
import AaaSLanding from './components/AaaSLanding';
import AwsAgentsCatalog from './components/AwsAgentsCatalog';
import CustomAgentsCatalog from './components/CustomAgentsCatalog';
import AwsDevOpsAgent from './components/AwsDevOpsAgent';
import AwsSecurityAgent from './components/AwsSecurityAgent';
import CustomAgentCreate from './components/CustomAgentCreate';
import Tools from './components/capabilities/Tools';
import Knowledge from './components/capabilities/Knowledge';
import Prompts from './components/capabilities/Prompts';
import CapabilitiesLanding from './components/CapabilitiesLanding';
import SecureLanding from './components/SecureLanding';
import GovernLanding from './components/GovernLanding';
import GovernWrapper from './components/govern/GovernWrapper';
import CommandCenter from './components/govern/CommandCenter';
import TrustStackPage from './components/govern/TrustStackPage';
import FleetOverview from './components/govern/FleetOverview';
import ModelManagement from './components/govern/ModelManagement';
import FinOps from './components/govern/FinOps';
import AuditIncidents from './components/govern/AuditIncidents';
import ComplianceCenter from './components/govern/ComplianceCenter';
import RiskManagement from './components/govern/RiskManagement';
import AgentRegistry from './components/govern/AgentRegistry';
import ShadowAI from './components/govern/ShadowAI';
import DataGovernanceLanding from './components/govern/data/DataGovernanceLanding';
import DataQuality from './components/govern/data/DataQuality';
import DataMetadata from './components/govern/data/DataMetadata';
import DataMaturity from './components/govern/data/DataMaturity';
import DataReadiness from './components/govern/data/DataReadiness';
import DataLineage from './components/govern/data/DataLineage';
import AgentDataProfiles from './components/govern/data/AgentDataProfiles';
import DataAccessControl from './components/govern/data/DataAccessControl';
import DataOntology from './components/govern/data/DataOntology';
import DataTaxonomy from './components/govern/data/DataTaxonomy';
import BusinessGlossary from './components/govern/data/BusinessGlossary';
import GraphRAG from './components/govern/data/GraphRAG';
import WorkflowsPage from './components/govern/WorkflowsPage';
import MyAgents from './components/MyAgents';
import MyApps from './components/MyApps';
import PromptOptimization from './components/PromptOptimization';
import MultiCloudGovernance from './components/govern/MultiCloudGovernance';
import DevToolsGovernance from './components/govern/DevToolsGovernance';
import AgenticGovernancePlaybook from './components/govern/AgenticGovernancePlaybook';
import ThreatModeling from './components/govern/ThreatModeling';
import AISafety from './components/govern/safety/AISafety';
import FrontierThresholds from './components/govern/safety/FrontierThresholds';
import SafetyCases from './components/govern/safety/SafetyCases';
import IncidentManagement from './components/govern/safety/IncidentManagement';
import IncidentPlaybooks from './components/govern/safety/IncidentPlaybooks';
import SafetyEvals from './components/govern/safety/SafetyEvals';
import RuntimeSafetyControls from './components/govern/safety/RuntimeSafetyControls';
import RedTeamTestPipeline from './components/govern/safety/RedTeamTestPipeline';
import DeveloperAiUsageView from './components/govern/DeveloperAiUsageView';
import PromptGovernance from './components/govern/PromptGovernance';

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) return <SignIn />;

  return (
    <UserProvider>
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        {/* Shared ombre gradient */}
        <div className="fixed inset-0 pointer-events-none z-0" style={{
          background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }} />
        <div className="relative h-full">
          <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<PlanLanding />} />
        <Route path="/use-cases" element={<Prioritization />} />
        <Route path="/maturity-assessment" element={<MaturityAssessment />} />
        <Route path="/operating-model" element={<OperatingModel />} />
        <Route path="/business-cases" element={<BusinessCases />} />
        <Route path="/organization-design" element={<OrganizationDesignPage />} />
        <Route path="/applications" element={<ApplicationsLanding />} />
        <Route path="/applications/fsi-foundry" element={<FSIFoundryCatalog />} />
        <Route path="/applications/reference-implementations" element={<ReferenceImplementations />} />
        <Route path="/applications/deploy/:useCaseId" element={<AppDeployCreate />} />
        <Route path="/applications/reference-implementations/deploy/:implId" element={<RefImplDeployCreate />} />
        <Route path="/applications/templates" element={<TemplateCatalog />} />
        <Route path="/applications/app-factory" element={<AppFactory />} />
        <Route path="/aaas" element={<AaaSLanding />} />
        <Route path="/aaas/aws-agents" element={<AwsAgentsCatalog />} />
        <Route path="/aaas/aws-agents/aws-devops" element={<AwsDevOpsAgent />} />
        <Route path="/aaas/aws-agents/aws-security" element={<AwsSecurityAgent />} />
        <Route path="/aaas/aws-agents/kiro" element={<AwsAgentsCatalog />} />
        <Route path="/aaas/custom" element={<CustomAgentsCatalog />} />
        <Route path="/aaas/custom/create" element={<CustomAgentCreate />} />
        <Route path="/aaas/custom/my-agents" element={<MyAgents />} />
        {/* Capabilities (formerly Tools Factory lived under /aaas/tools) */}
        <Route path="/aaas/tools" element={<Navigate to="/capabilities/tools" replace />} />
        <Route path="/capabilities" element={<CapabilitiesLanding />} />
        <Route path="/capabilities/tools" element={<Tools />} />
        <Route path="/capabilities/knowledge" element={<Knowledge />} />
        <Route path="/capabilities/prompts" element={<Prompts />} />
        {/* Govern: hub landing + dedicated pages for each capability */}
        <Route path="/govern" element={<GovernWrapper><GovernLanding /></GovernWrapper>} />
        <Route path="/govern/command-center" element={<GovernWrapper><CommandCenter /></GovernWrapper>} />
        <Route path="/govern/trust-stack" element={<GovernWrapper><TrustStackPage /></GovernWrapper>} />
        <Route path="/govern/fleet" element={<GovernWrapper><FleetOverview /></GovernWrapper>} />
        <Route path="/govern/models" element={<GovernWrapper><ModelManagement /></GovernWrapper>} />
        <Route path="/govern/agents" element={<GovernWrapper><AgentRegistry /></GovernWrapper>} />
        <Route path="/govern/shadow-ai" element={<GovernWrapper><ShadowAI /></GovernWrapper>} />
        <Route path="/govern/prompt-governance" element={<GovernWrapper><PromptGovernance /></GovernWrapper>} />
        <Route path="/govern/developer-ai" element={<GovernWrapper><DeveloperAiUsageView /></GovernWrapper>} />
        <Route path="/govern/risk" element={<GovernWrapper><RiskManagement /></GovernWrapper>} />
        <Route path="/govern/compliance" element={<GovernWrapper><ComplianceCenter /></GovernWrapper>} />
        <Route path="/govern/finops" element={<GovernWrapper><FinOps /></GovernWrapper>} />
        <Route path="/govern/audit" element={<GovernWrapper><AuditIncidents /></GovernWrapper>} />
        <Route path="/govern/hrais" element={<Navigate to="/govern/risk?tab=hrais" replace />} />
        <Route path="/govern/workflows" element={<GovernWrapper><WorkflowsPage /></GovernWrapper>} />
        <Route path="/govern/playbook" element={<GovernWrapper><AgenticGovernancePlaybook /></GovernWrapper>} />
        <Route path="/govern/safety" element={<GovernWrapper><AISafety /></GovernWrapper>} />
        <Route path="/govern/safety/evals" element={<GovernWrapper><SafetyEvals /></GovernWrapper>} />
        <Route path="/govern/safety/redteam-pipeline" element={<GovernWrapper><RedTeamTestPipeline /></GovernWrapper>} />
        {/* Threat Modeling now lives under the Safety module; keep the old path as a redirect-friendly alias */}
        <Route path="/govern/threat-modeling" element={<GovernWrapper><ThreatModeling /></GovernWrapper>} />
        <Route path="/govern/safety/threat-modeling" element={<GovernWrapper><ThreatModeling /></GovernWrapper>} />
        <Route path="/govern/safety/capabilities" element={<GovernWrapper><FrontierThresholds /></GovernWrapper>} />
        <Route path="/govern/safety/safety-cases" element={<GovernWrapper><SafetyCases /></GovernWrapper>} />
        <Route path="/govern/safety/incidents" element={<GovernWrapper><IncidentManagement /></GovernWrapper>} />
        <Route path="/govern/safety/playbooks" element={<GovernWrapper><IncidentPlaybooks /></GovernWrapper>} />
        <Route path="/govern/safety/runtime" element={<GovernWrapper><RuntimeSafetyControls /></GovernWrapper>} />
        <Route path="/govern/multi-cloud" element={<GovernWrapper><MultiCloudGovernance /></GovernWrapper>} />
        <Route path="/govern/dev-tools" element={<GovernWrapper><DevToolsGovernance /></GovernWrapper>} />
        <Route path="/govern/data" element={<GovernWrapper><DataGovernanceLanding /></GovernWrapper>} />
        {/* Consolidated: the card-grid Landing is the single Data Governance front door */}
        <Route path="/govern/data-hub" element={<Navigate to="/govern/data" replace />} />
        <Route path="/govern/data/quality" element={<GovernWrapper><DataQuality /></GovernWrapper>} />
        <Route path="/govern/data/metadata" element={<GovernWrapper><DataMetadata /></GovernWrapper>} />
        <Route path="/govern/data/maturity" element={<GovernWrapper><DataMaturity /></GovernWrapper>} />
        <Route path="/govern/data/readiness" element={<GovernWrapper><DataReadiness /></GovernWrapper>} />
        <Route path="/govern/data/lineage" element={<GovernWrapper><DataLineage /></GovernWrapper>} />
        <Route path="/govern/data/agents" element={<GovernWrapper><AgentDataProfiles /></GovernWrapper>} />
        <Route path="/govern/data/access" element={<GovernWrapper><DataAccessControl /></GovernWrapper>} />
        <Route path="/govern/data/ontology" element={<GovernWrapper><DataOntology /></GovernWrapper>} />
        <Route path="/govern/data/taxonomy" element={<GovernWrapper><DataTaxonomy /></GovernWrapper>} />
        <Route path="/govern/data/glossary" element={<GovernWrapper><BusinessGlossary /></GovernWrapper>} />
        <Route path="/govern/data/graphrag" element={<GovernWrapper><GraphRAG /></GovernWrapper>} />
        {/* Legacy redirects */}
        <Route path="/govern/dashboard" element={<Navigate to="/govern" replace />} />
        <Route path="/govern/cost-tracking" element={<Navigate to="/govern/finops" replace />} />
        <Route path="/applications/my-apps" element={<MyApps />} />
        <Route path="/templates" element={<TemplateCatalog />} />
        <Route path="/observability" element={<ObservabilityLanding />} />
        <Route path="/observability/langfuse" element={<Observability />} />
        <Route path="/observability/agentcore" element={<AgentCoreObservability />} />
        <Route path="/prompt-optimization" element={<PromptOptimization />} />
        <Route path="/secure" element={<SecureLanding />} />
        <Route path="/secure/guardrails" element={<Guardrails initialTab="templates" />} />
        <Route path="/secure/guardrails/create" element={<Guardrails initialTab="builder" />} />
        <Route path="/secure/guardrails/observability" element={<Guardrails initialTab="observability" />} />
        <Route path="/secure/policy" element={<Policy initialTab="engines" />} />
        {/* Legacy flat-policy routes now land on the engine-first view (policies live inside an engine) */}
        <Route path="/secure/policy/create" element={<Policy initialTab="engines" />} />
        <Route path="/secure/policy/engines" element={<Policy initialTab="engines" />} />
        <Route path="/secure/policy/observability" element={<Policy initialTab="observability" />} />
        {/* Template Library folded into the engine create-policy flow; redirect legacy link */}
        <Route path="/secure/policy/templates" element={<Policy initialTab="engines" />} />
        <Route path="/secure/policy/playground" element={<Policy initialTab="playground" />} />
        <Route path="/secure/policy/tools" element={<Policy initialTab="tools" />} />
        <Route path="/secure/policy/audit" element={<Policy initialTab="audit" />} />
        {/* LLM Gateway page now embeds LiteLLM's own admin UI (LLMGateway.tsx
            iframes /ui behind the AVA SSO gate). The old sub-tabs (config,
            models, keys, spend, audit, playground) are all provided by
            LiteLLM directly, so a single route is sufficient. Legacy
            sub-paths are preserved as redirects-in-place so bookmarks
            don't 404. */}
        <Route path="/secure/llm-gateway" element={<LLMGateway />} />
        <Route path="/secure/llm-gateway/config" element={<LLMGateway />} />
        <Route path="/secure/llm-gateway/models" element={<LLMGateway />} />
        <Route path="/secure/llm-gateway/keys" element={<LLMGateway />} />
        <Route path="/secure/llm-gateway/spend" element={<LLMGateway />} />
        <Route path="/secure/llm-gateway/audit" element={<LLMGateway />} />
        <Route path="/secure/llm-gateway/playground" element={<LLMGateway />} />
        <Route path="/secure/guardrails/fsi-library" element={<Guardrails initialTab="fsi-library" />} />
        <Route path="/secure/guardrails/playground" element={<Guardrails initialTab="playground" />} />
        <Route path="/secure/guardrails/assignments" element={<Navigate to="/secure/guardrails/observability" replace />} />
        <Route path="/secure/guardrails/tools" element={<Guardrails initialTab="tools" />} />
        <Route path="/deployments" element={<DeploymentList />} />
        <Route path="/deployments/create" element={<DeploymentCreate />} />
        <Route path="/deployments/:id" element={<DeploymentDetail />} />
        <Route path="/docs" element={<Documentation />} />
        <Route path="/docs/:section" element={<Documentation />} />
      </Routes>
        </div>
      </main>
    </div>
    </UserProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthGate />
      </Router>
    </AuthProvider>
  );
}

export default App;
