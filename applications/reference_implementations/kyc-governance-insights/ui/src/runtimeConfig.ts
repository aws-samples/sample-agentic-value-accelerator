/**
 * Runtime configuration loader (FSI Foundry deploy pattern).
 *
 * The Foundry UI deploy generates `public/runtime-config.json` at deploy time
 * (from the offering registry + Terraform outputs) and serves it as a static
 * file. We fetch it once, before the app renders (see main.tsx), and cache it
 * on `window` so the synchronous `import.meta.env`-style accessors used
 * throughout the app can read it without turning every call site async.
 *
 * When no runtime-config.json is present (e.g. running the app standalone via
 * `npm run dev`), every accessor falls back to the original `VITE_*` build-time
 * environment variables, preserving the standalone behaviour.
 */

export interface RuntimeConfigAgent {
  id: string;
  name: string;
  description?: string;
}

export interface RuntimeConfig {
  use_case_id?: string;
  use_case_name?: string;
  description?: string;
  domain?: string;
  agents?: RuntimeConfigAgent[];
  /** AgentCore proxy endpoint the UI invokes (…/invoke, …/status/{id}). */
  api_endpoint?: string;
  /** Optional governance-services base URL for the LLM-judge / deterministic checks. */
  governance_api_url?: string;
  /**
   * Console-services URLs + auth for the full governance console. Any of these
   * that are absent fall back to the corresponding VITE_* build-time env, and
   * ultimately to the app's bundled mock data (via useLiveData fallbacks).
   */
  metrics_api_url?: string;
  cedar_api_url?: string;
  registry_api_url?: string;
  hitl_api_url?: string;
  grounding_api_url?: string;
  /** Policy-config proxy base URL (Decision-Rules sliders -> DDB). Same-origin
   *  /svc/policy-config via CloudFront in the deploy; VITE fallback for dev. */
  policy_config_api_url?: string;
  api_key?: string;
  tenant_id?: string;
  input_schema?: {
    id_field?: string;
    id_label?: string;
    id_placeholder?: string;
    type_field?: string;
    type_options?: { value: string; label: string }[];
    test_entities?: string[];
  };
  [key: string]: unknown;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

/**
 * Resolve a config value: runtime-config.json key first, then the VITE_* env
 * fallback. Use for the console-service URLs + auth so a single runtime-config
 * (injected by the Foundry deploy) drives all the live surfaces, while
 * standalone `npm run dev` still honours the .env file.
 */
export function cfgEnv(rcKey: keyof RuntimeConfig, viteVal: string | undefined): string {
  const rc = getRuntimeConfig();
  const v = rc[rcKey];
  if (typeof v === 'string' && v) return v;
  return viteVal || '';
}

let cached: RuntimeConfig | null = null;

/**
 * Fetch runtime-config.json once and cache it. Safe to call before render.
 * Never throws — a missing/invalid file yields an empty config (VITE fallback).
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    cached = window.__RUNTIME_CONFIG__;
    return cached;
  }
  try {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const res = await fetch(`${base}/runtime-config.json`, { cache: 'no-store' });
    cached = res.ok ? ((await res.json()) as RuntimeConfig) : {};
  } catch {
    cached = {};
  }
  // The Foundry deploy nests the console-service URLs under `console_services`;
  // flatten them to the top level so cfgEnv() (which reads top-level keys) works
  // for both the deploy-generated (nested) and seed (flat) shapes.
  const cs = cached && (cached.console_services as Record<string, unknown> | undefined);
  if (cs && typeof cs === 'object') {
    for (const [k, v] of Object.entries(cs)) {
      if (cached[k] === undefined) cached[k] = v;
    }
  }
  if (typeof window !== 'undefined') window.__RUNTIME_CONFIG__ = cached;
  return cached;
}

/** Synchronous accessor — returns {} until loadRuntimeConfig() has resolved. */
export function getRuntimeConfig(): RuntimeConfig {
  if (cached) return cached;
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    cached = window.__RUNTIME_CONFIG__;
    return cached;
  }
  return {};
}
