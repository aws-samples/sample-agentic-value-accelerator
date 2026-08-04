export interface ProjectCreate {
  project_name: string;
  framework: "langraph" | "strands";
  iac_type: "terraform" | "cdk" | "cloudformation";
  langfuse_server_id?: string;
  aws_region: string;
  tags?: Record<string, string>;
}

export interface ProjectResponse {
  id: string;
  project_name: string;
  framework: string;
  template_name: string;
  iac_type: string;
  aws_region: string;
  tags?: Record<string, string>;
  langfuse_server_id?: string;
  s3_url: string;
  expires_at: string;
  created_by: string;
  created_at: string;
}

export interface LangfuseServer {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  public_key: string;
  secret_name?: string;
  secret_key_field?: string;
  status: "active" | "inactive" | "maintenance";
  created_at: string;
  updated_at: string;
}

export interface LangfuseServerCreate {
  name: string;
  endpoint: string;
  region: string;
  public_key: string;
  secret_name?: string;
  secret_key_field?: string;
  status?: "active" | "inactive" | "maintenance";
}

export interface ApiError {
  detail: string;
  error?: string;
}

// Template Catalog Types
export interface Framework {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface DeploymentPattern {
  id: string;
  name: string;
  description: string;
  path: string;
  disabled?: boolean;
}

export interface Parameter {
  name: string;
  description: string;
  type: string;
  required: boolean;
  default?: any;
  minimum?: number;
  maximum?: number;
  input_type?: "text" | "email" | "password";
}

export interface Template {
  id: string;
  name: string;
  description: string;
  version: string;
  tier: string;
  category: string;
  iac_options: string[];
  includes: { infra?: boolean; agent_code?: boolean; ui?: boolean; tests?: boolean };
  tags: string[];
  aws_services: string[];
  frameworks_list: string[];
  built_with: string[];
  resources?: { name: string; description: string }[];
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    default?: string;
  }[];
  pattern_description?: string;
  learn_more?: { title: string; url: string }[];
  // Legacy fields (used by BootstrapForm and DeploymentCreate)
  pattern_type?: string;
  frameworks?: Framework[];
  deployment_patterns?: DeploymentPattern[];
  type?: string;
  dependencies?: string[];
}

export interface TemplateStats {
  total_templates: number;
  tiers: Record<string, number>;
  categories: Record<string, number>;
  frameworks: string[];
  iac_options: string[];
}

export interface BootstrapRequest {
  template_id: string;
  project_name: string;
  parameters: Record<string, any>;
  framework_id: string;
  deployment_pattern_id: string;
}

// Deployment Types
export type DeploymentStatus =
  | "pending"
  | "validating"
  | "packaging"
  | "deploying"
  | "verifying"
  | "deployed"
  | "destroying"
  | "destroyed"
  | "packaged"
  | "delivered"
  | "failed"
  | "rolled_back";

export interface StatusHistoryEntry {
  status: string;
  timestamp: string;
  message?: string;
}

export interface DeploymentCreate {
  deployment_name: string;
  template_id: string;
  iac_type: string;
  framework_id?: string;
  aws_region: string;
  parameters: Record<string, any>;
  target_account_id?: string;
  target_role_arn?: string;
}

export interface Deployment {
  deployment_id: string;
  deployment_name: string;
  template_id: string;
  iac_type: string;
  framework_id?: string;
  aws_account: string;
  aws_region: string;
  s3_bucket: string;
  s3_key?: string;
  status: DeploymentStatus;
  status_history: StatusHistoryEntry[];
  error_message?: string;
  failed_stage?: string;
  execution_arn?: string;
  build_id?: string;
  outputs?: Record<string, string>;
  parameters?: Record<string, string>;
  target_account_id?: string;
  target_role_arn?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DeploymentStatusResponse {
  deployment_id: string;
  status: DeploymentStatus;
  status_history: StatusHistoryEntry[];
  outputs: Record<string, string>;
  failed_stage?: string;
  error_message?: string;
  build_id?: string;
}

// Application Types
export interface AppAgent {
  id: string;
  name: string;
}

export interface AppUseCase {
  id: string;
  category?: string;
  use_case_name: string;
  name: string;
  description: string;
  application_path: string;
  data_path: string;
  supported_frameworks: string[];
  supported_patterns: string[];
  agents: AppAgent[];
  id_field?: string;
  type_field?: string;
  type_values?: string[];
  test_entities?: string[];
  test_accounts?: string[];
}

export interface TestDeploymentRequest {
  payload: Record<string, any>;
}

export interface TestStartResponse {
  test_id: string;
  status: string;
}

export interface TestDeploymentResponse {
  test_id: string;
  status: string;
  success?: boolean;
  response?: any;
  error?: string;
  output?: string;
  exit_code?: number;
  duration_ms?: number;
}

export interface ScriptTestResponse {
  success: boolean;
  output: string;
  exit_code: number;
  duration_ms: number;
}

export type AppDeploymentStatus = "pending" | "building" | "deploying" | "active" | "failed";

export interface AppDeployment {
  deployment_id: string;
  use_case_id: string;
  use_case_name: string;
  framework: string;
  aws_region: string;
  status: AppDeploymentStatus;
  runtime_arn?: string;
  endpoint?: string;
  created_at: string;
  updated_at: string;
}

// --- Guardrails ---

export type GuardrailFilterStrength = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type GuardrailFilterType =
  | "HATE"
  | "INSULTS"
  | "SEXUAL"
  | "VIOLENCE"
  | "MISCONDUCT"
  | "PROMPT_ATTACK";
export type GuardrailPiiAction = "BLOCK" | "ANONYMIZE";
export type GuardrailStatus =
  | "draft"
  | "creating"
  | "active"
  | "updating"
  | "failed"
  | "deleting"
  | "deleted";

export interface ContentFilterConfig {
  type: GuardrailFilterType;
  input_strength: GuardrailFilterStrength;
  output_strength: GuardrailFilterStrength;
}

export interface DeniedTopic {
  name: string;
  definition: string;
  examples: string[];
}

export interface PiiEntityConfig {
  type: string;
  action: GuardrailPiiAction;
}

export interface SensitiveRegexConfig {
  name: string;
  pattern: string;
  description?: string;
  action: GuardrailPiiAction;
}

export interface WordFilterConfig {
  enable_profanity: boolean;
  blocked_words: string[];
}

export interface ContextualGroundingConfig {
  enabled: boolean;
  grounding_threshold: number;
  relevance_threshold: number;
}

export interface GuardrailTemplateCreate {
  name: string;
  description?: string;
  content_filters: ContentFilterConfig[];
  denied_topics: DeniedTopic[];
  pii_entities: PiiEntityConfig[];
  sensitive_regexes: SensitiveRegexConfig[];
  word_filter?: WordFilterConfig;
  contextual_grounding?: ContextualGroundingConfig;
}

export interface GuardrailTemplate {
  template_id: string;
  name: string;
  description?: string;
  status: GuardrailStatus;
  guardrail_id?: string;
  guardrail_arn?: string;
  guardrail_version?: string;
  content_filters: ContentFilterConfig[];
  denied_topics: DeniedTopic[];
  pii_entities: PiiEntityConfig[];
  sensitive_regexes: SensitiveRegexConfig[];
  word_filter?: WordFilterConfig;
  contextual_grounding?: ContextualGroundingConfig;
  status_history: { status: string; timestamp: string; message?: string }[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface GuardrailPreset {
  id: string;
  name: string;
  description: string;
  tags: string[];
  config: GuardrailTemplateCreate;
}

export interface GuardrailMetrics {
  guardrail_id: string;
  total_invocations: number;
  blocked_count: number;
  allowed_count: number;
  anonymized_count: number;
  block_rate: number;
  top_triggered_filter?: string;
  filter_breakdown: Record<string, number>;
  time_series: { timestamp: string; invocations: number }[];
  recent_events: GuardrailEvent[];
}

export interface GuardrailEvent {
  timestamp: string;
  guardrail_id: string;
  guardrail_name?: string;
  action: string;
  filter_type?: string;
  input_snippet?: string;
  details?: Record<string, any>;
}

// -----------------------------------------------------------------------------
// Knowledge
// -----------------------------------------------------------------------------

export interface GlueTable {
  name: string;
  table_type: string;
}

export interface GlueDatabase {
  name: string;
  description: string;
  tables: GlueTable[];
}

export interface AthenaWorkgroup {
  name: string;
  state: string;
}

export interface KnowledgeRegistration {
  registration_id: string;
  name: string;
  type: string;
  description: string;
  status: "PROVISIONING" | "ACTIVE" | "FAILED" | "DELETING" | "DELETED";
  config: Record<string, any>;
  gateway_endpoint: string;
  tools: string[];
  mcp_server: string;
  iam_role_arn: string;
  runtime_id: string;
  gateway_id: string;
  target_id: string;
  error_message: string;
  created_at: string;
  updated_at: string;
}
// Service Approval (Service Onboarding) ------------------------------------

export type ServiceApprovalTestingMode = "skip" | "dry-run" | "full-deploy";
export type ServiceApprovalFramework = "ccmv4" | "nist" | "cis" | "iso";
export type ServiceApprovalRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type ServiceApprovalPhaseStatus = "pending" | "running" | "complete" | "failed";

export interface ServiceApprovalPhaseState {
  key: string; // assess | research | validate | map | generate | test | summarize | evidence
  label: string;
  status: ServiceApprovalPhaseStatus;
  file_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
}

export interface ServiceApprovalRun {
  slug: string;
  service: string;
  framework: ServiceApprovalFramework;
  testing_mode: ServiceApprovalTestingMode;
  status: ServiceApprovalRunStatus;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  execution_arn?: string | null;
  phases: ServiceApprovalPhaseState[];
  approval_report_path?: string | null; // s3 key relative to slug, e.g. 07-summarize/APPROVAL-REPORT.md
  error?: string | null;
}

export interface ServiceApprovalRunCreate {
  service: string;
  framework: ServiceApprovalFramework;
  testing_mode: ServiceApprovalTestingMode;
}

export interface ServiceApprovalFileEntry {
  path: string; // relative to slug, e.g. 05-generate/preventive/CTRL-ORG-PRV-001.json
  size: number;
  modified_at: string;
}

export interface ServiceApprovalFileTree {
  slug: string;
  phase: string; // e.g. 05-generate
  groups: { name: string; files: ServiceApprovalFileEntry[] }[];
}

export interface ServiceApprovalFileContent {
  path: string;
  size: number;
  content: string;
  encoding: "utf-8" | "base64";
  language?: string;
}

export interface AwsService {
  label: string;
  slug: string;
}

// Guardrail Validation (Test Suite) ------------------------------------------

export type GuardrailTestCaseCategory =
  | "pii"
  | "content-filter"
  | "denied-topics"
  | "prompt-injection"
  | "grounding"
  | "word-filter"
  | "regex";
export type GuardrailTestSeverity = "critical" | "high" | "medium" | "low";
export type GuardrailTestSchedule = "hourly" | "daily" | "weekly" | "manual";
export type GuardrailTestRunStatus = "success" | "partial" | "failed";

export interface GuardrailTestCase {
  id: string;
  name: string;
  description: string;
  input: string;
  expectedResult: "block" | "pass";
  category: GuardrailTestCaseCategory;
  severity: GuardrailTestSeverity;
}

export interface GuardrailTestSuite {
  id: string;
  name: string;
  description: string;
  guardrailId: string;
  guardrailName: string;
  testCases: GuardrailTestCase[];
  schedule: GuardrailTestSchedule;
  lastRun?: string;
  nextRun?: string;
  enabled: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface GuardrailTestResult {
  testCaseId: string;
  testCaseName: string;
  input: string;
  expectedResult: "block" | "pass";
  actualResult: "block" | "pass";
  passed: boolean;
  latency: number;
  details?: string;
}

export interface GuardrailTestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  guardrailId: string;
  guardrailName: string;
  timestamp: string;
  duration: number;
  totalTests: number;
  passed: number;
  failed: number;
  status: GuardrailTestRunStatus;
  results: GuardrailTestResult[];
  triggeredBy?: "scheduled" | "manual";
}

export interface GuardrailValidationSummary {
  totalSuites: number;
  enabledSuites: number;
  totalTestCases: number;
  lastRunTimestamp?: string;
  passRate24h: number;
  failedTests24h: number;
  criticalFailures24h: number;
  coverageByCategory: Record<GuardrailTestCaseCategory, number>;
  recentRuns: GuardrailTestRun[];
  trendData7d: { date: string; passed: number; failed: number }[];
}

// Advanced Prompt Optimization (AdvPO) -------------------------------------

export type AdvPOJobStatus =
  | "Submitted"
  | "InProgress"
  | "Completed"
  | "PartiallyCompleted"
  | "Failed"
  | "Stopping"
  | "Stopped"
  | "Deleting";

export interface AdvPOInferenceConfig {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

export interface AdvPOModelConfiguration {
  model_id: string;
  inference_config?: AdvPOInferenceConfig;
  additional_model_request_fields?: Record<string, unknown>;
}

export interface AdvPOJobCreate {
  job_name: string;
  input_s3_uri: string;
  model_configurations: AdvPOModelConfiguration[];
  output_s3_uri?: string;
  job_description?: string;
  encryption_key_arn?: string;
  tags?: Record<string, string>;
}

export interface AdvPOJobSummary {
  job_arn: string;
  job_name: string;
  status: AdvPOJobStatus;
}

export interface AdvPOJob {
  job_arn: string;
  job_name: string;
  status: AdvPOJobStatus;
  input_s3_uri?: string;
  output_s3_uri?: string;
  model_configurations: AdvPOModelConfiguration[];
  encryption_key_arn?: string;
  failure_message?: string;
  creation_time?: string;
  last_modified_time?: string;
  results_uri?: string;
}

export interface AdvPODatasetUpload {
  name: string;
  content: string;
}

export interface AdvPODatasetUploadResult {
  s3_uri: string;
  bucket: string;
  key: string;
  size: number;
}

export interface AdvPODatasetItem {
  key: string;
  name: string;
  s3_uri: string;
  size: number;
  last_modified?: string;
}

export interface AdvPODatasetList {
  bucket: string;
  datasets: AdvPODatasetItem[];
}

export interface AdvPOResults {
  job_arn: string;
  s3_uri: string;
  content: string;
}

export type AdvPOModelScope = "global" | "regional" | "in_region";

export interface AdvPOModel {
  id: string;
  name: string;
  scope: AdvPOModelScope;
  provider?: string;
  cris_geo?: string;
}

export interface AdvPOModelList {
  region: string;
  cris_geo: string;
  models: AdvPOModel[];
}

export interface AdvPOJobListItem {
  job_arn: string;
  job_name: string;
  status: AdvPOJobStatus;
  creation_time?: string;
  last_modified_time?: string;
}

export interface AdvPOJobList {
  jobs: AdvPOJobListItem[];
  next_token?: string;
}
