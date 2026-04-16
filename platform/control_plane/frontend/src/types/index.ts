export interface ProjectCreate {
  project_name: string;
  framework: 'langraph' | 'strands';
  iac_type: 'terraform' | 'cdk' | 'cloudformation';
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
  status: 'active' | 'inactive' | 'maintenance';
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
  status?: 'active' | 'inactive' | 'maintenance';
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
  input_type?: 'text' | 'email' | 'password';
}

export interface Template {
  id: string;
  name: string;
  description: string;
  version: string;
  pattern_type: string;
  frameworks?: Framework[];
  deployment_patterns?: DeploymentPattern[];
  parameters?: Parameter[];
  architecture_diagram?: string;
  example_use_cases?: string[];
  tags?: string[];
  type?: string;
  dependencies?: string[];
}

export interface TemplateStats {
  total_templates: number;
  pattern_types: string[];
  frameworks: string[];
  deployment_patterns: string[];
}

export interface BootstrapRequest {
  template_id: string;
  project_name: string;
  parameters: Record<string, any>;
  framework_id: string;
  deployment_pattern_id: string;
}

// Deployment Types
export type DeploymentStatus = 'pending' | 'validating' | 'packaging' | 'deploying' | 'verifying' | 'deployed' | 'destroying' | 'destroyed' | 'packaged' | 'delivered' | 'failed' | 'rolled_back';

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
  use_case_name: string;
  name: string;
  description: string;
  application_path: string;
  data_path: string;
  supported_frameworks: string[];
  supported_patterns: string[];
  agents: AppAgent[];
  type_field?: string;
  type_values?: string[];
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

export type AppDeploymentStatus = 'pending' | 'building' | 'deploying' | 'active' | 'failed';

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
