export interface AgentInfo {
  id: string;
  name: string;
  description: string;
}

export interface TypeOption {
  value: string;
  label: string;
}

export interface InputSchema {
  id_field: string;
  id_label: string;
  id_placeholder: string;
  type_field: string;
  type_options: TypeOption[];
  test_entities: string[];
}

export interface RuntimeConfig {
  use_case_id: string;
  use_case_name: string;
  description: string;
  domain: string;
  agents: AgentInfo[];
  api_endpoint: string;
  input_schema: InputSchema;
}

let cachedConfig: RuntimeConfig | null = null;

export async function loadConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  const response = await fetch('/runtime-config.json');
  cachedConfig = await response.json();
  return cachedConfig!;
}
