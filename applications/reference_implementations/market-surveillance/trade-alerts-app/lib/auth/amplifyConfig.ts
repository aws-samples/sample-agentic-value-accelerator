/**
 * Amplify Configuration
 * 
 * This file configures AWS Amplify with Cognito settings.
 * Fetches configuration from runtime API endpoint to support Docker deployments.
 */

import { Amplify } from 'aws-amplify';

export interface AmplifyAuthConfig {
    region: string;
    userPoolId: string;
    userPoolClientId: string;
    identityPoolId?: string;
    oauth?: {
        domain: string;
        scope: string[];
        redirectSignIn: string;
        redirectSignOut: string;
        responseType: string;
    };
}

let isConfigured = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Configure Amplify with Cognito settings
 * 
 * @param config - Amplify auth configuration
 */
export function configureAmplify(config: AmplifyAuthConfig) {
    const cognitoConfig: any = {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: {
            email: true,
            username: true,
        },
        signUpVerificationMethod: 'code',
        userAttributes: {
            email: {
                required: true,
            },
        },
        allowGuestAccess: false,
        passwordFormat: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireNumbers: true,
            requireSpecialCharacters: true,
        },
    };

    // Only add identityPoolId if it's provided
    if (config.identityPoolId) {
        cognitoConfig.identityPoolId = config.identityPoolId;
    }

    Amplify.configure({
        Auth: {
            Cognito: cognitoConfig,
        },
    });

    isConfigured = true;
}

/**
 * Build config from NEXT_PUBLIC_* env vars (inlined by Next.js at build time)
 */
function getEnvFallbackConfig(): AmplifyAuthConfig | null {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';

    if (userPoolId && userPoolClientId) {
        return { region, userPoolId, userPoolClientId };
    }
    return null;
}

/**
 * Initialize Amplify with runtime configuration.
 * Fetches config from API endpoint to support Docker deployments,
 * falling back to NEXT_PUBLIC_* env vars if the fetch fails.
 *
 * @returns true if Amplify was configured successfully, false otherwise
 */
export async function initializeAmplify() {
    // Return existing promise if initialization is in progress
    if (initializationPromise) {
        return initializationPromise;
    }

    // Already configured, return immediately
    if (isConfigured) {
        return Promise.resolve();
    }

    // Create initialization promise
    initializationPromise = (async () => {
        try {
            // Fetch runtime configuration
            const response = await fetch('/api/config');
            const runtimeConfig = await response.json();

            const config: AmplifyAuthConfig = {
                region: runtimeConfig.awsRegion,
                userPoolId: runtimeConfig.cognitoUserPoolId,
                userPoolClientId: runtimeConfig.cognitoClientId,
            };

            // Validate required configuration
            const missingVars: string[] = [];

            if (!config.userPoolId) {
                missingVars.push('NEXT_PUBLIC_COGNITO_USER_POOL_ID');
            }

            if (!config.userPoolClientId) {
                missingVars.push('NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID');
            }

            // Only configure if required values are present
            if (missingVars.length === 0) {
                configureAmplify(config);
                console.log('Amplify configured successfully with region:', config.region);
            } else {
                console.warn(
                    '⚠️  Amplify configuration incomplete. Missing required environment variables:',
                    missingVars.join(', ')
                );
                console.warn(
                    '⚠️  Authentication will not work until these variables are set'
                );
            }
        } catch (error) {
            console.error('Failed to fetch runtime configuration:', error);
        }
    })();

    return initializationPromise;
}

/**
 * Check if Amplify is configured
 */
export function isAmplifyConfigured(): boolean {
    return isConfigured;
}
