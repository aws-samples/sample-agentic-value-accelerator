/**
 * useAwsConnected — is the AWS account actually connected?
 *
 * The honest signal for "AWS is connected" is account REACHABILITY, not whether
 * any agents happen to be deployed. We probe the Bedrock model catalog
 * (ListFoundationModels) — it returns live=true whenever the connected account is
 * reachable, independent of deployments/cost/agents — and cache it server-side.
 *
 * Used by every connector-status surface (Multi-Cloud Providers, Inventory
 * Connectors) so they all agree on AWS being connected the moment an account is
 * linked, even before the first agent is deployed.
 */
import { useEffect, useState } from 'react';
import { governModelsApi } from '../../api/client';

export function useAwsConnected(): { awsConnected: boolean; loading: boolean } {
  const [awsConnected, setAwsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    governModelsApi.catalog()
      .then(c => { if (!cancelled) setAwsConnected(!!c.live); })
      .catch(() => { if (!cancelled) setAwsConnected(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { awsConnected, loading };
}

export default useAwsConnected;
