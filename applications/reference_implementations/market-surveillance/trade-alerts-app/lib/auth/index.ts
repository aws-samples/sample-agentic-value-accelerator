/**
 * Authentication Module
 * 
 * Exports all authentication-related functionality
 */

export { authService } from './authService';
export type { AuthUser, SignInResult, SignUpResult, ResetPasswordResult } from './authService';

export { configureAmplify, initializeAmplify, isAmplifyConfigured } from './amplifyConfig';
export type { AmplifyAuthConfig } from './amplifyConfig';

export { useAuth } from './useAuth';
