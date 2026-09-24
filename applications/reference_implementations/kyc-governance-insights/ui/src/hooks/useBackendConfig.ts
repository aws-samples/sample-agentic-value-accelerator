import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api/client';

interface BackendConfig {
  model: string;
  model_id: string;
  runtime_id: string;
}

const DEFAULT_CONFIG: BackendConfig = {
  model: 'Claude Sonnet 4.5',
  model_id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  runtime_id: '',
};

let cachedConfig: BackendConfig | null = null;

export function useBackendConfig(): BackendConfig {
  const [config, setConfig] = useState<BackendConfig>(cachedConfig || DEFAULT_CONFIG);

  useEffect(() => {
    if (cachedConfig) return;
    fetch(`${API_BASE_URL}/config`)
      .then((r) => r.ok ? r.json() : DEFAULT_CONFIG)
      .then((data) => { cachedConfig = data; setConfig(data); })
      .catch(() => {});
  }, []);

  return config;
}

/** Non-hook accessor for use in static data files */
export function getModelName(): string {
  return cachedConfig?.model || DEFAULT_CONFIG.model;
}
