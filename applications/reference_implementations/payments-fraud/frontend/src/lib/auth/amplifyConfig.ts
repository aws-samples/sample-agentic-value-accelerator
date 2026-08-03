/**
 * Amplify (Cognito) configuration. Fetches runtime config from /api/config so the
 * build can be repointed without rebuild; falls back to NEXT_PUBLIC_* env vars.
 * Adapted from the market-surveillance reference app.
 */
import { Amplify } from "aws-amplify";

export interface AmplifyAuthConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
}

let isConfigured = false;
let initializationPromise: Promise<void> | null = null;

export function configureAmplify(config: AmplifyAuthConfig) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: { email: true, username: true },
      },
    },
  });
  isConfigured = true;
}

export function isAmplifyConfigured(): boolean {
  return isConfigured;
}

export async function initializeAmplify(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  if (isConfigured) return Promise.resolve();

  initializationPromise = (async () => {
    try {
      const res = await fetch("/api/config");
      const c = await res.json();
      const config: AmplifyAuthConfig = {
        region: c.awsRegion,
        userPoolId: c.cognitoUserPoolId,
        userPoolClientId: c.cognitoClientId,
      };
      if (config.userPoolId && config.userPoolClientId) {
        configureAmplify(config);
        console.log("Amplify configured (region:", config.region, ")");
      } else {
        console.warn(
          "Amplify not configured - set NEXT_PUBLIC_COGNITO_USER_POOL_ID and " +
            "NEXT_PUBLIC_COGNITO_CLIENT_ID. Auth is disabled.",
        );
      }
    } catch (e) {
      console.error("Failed to load /api/config:", e);
    }
  })();

  return initializationPromise;
}
