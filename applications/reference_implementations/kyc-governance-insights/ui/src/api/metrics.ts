import type { MetricsApiResponse } from '../types/metrics';

const METRICS_ENDPOINT = '/api-b/metrics';

export async function fetchMetrics(): Promise<MetricsApiResponse> {
  const response = await fetch(METRICS_ENDPOINT, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new MetricsApiError(`HTTP ${response.status}`, response.status);
  }

  return (await response.json()) as MetricsApiResponse;
}

export class MetricsApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'MetricsApiError';
    this.statusCode = statusCode;
  }
}
