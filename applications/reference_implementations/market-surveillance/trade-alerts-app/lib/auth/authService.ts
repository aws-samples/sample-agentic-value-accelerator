/**
 * Authentication Service for AWS Cognito using Amplify
 * 
 * This service provides authentication functionality including:
 * - Sign in / Sign out
 * - Sign up
 * - Password reset
 * - Get current user
 * - Session management
 */

import { signIn, signOut, signUp, confirmSignUp, resetPassword, confirmResetPassword, getCurrentUser, fetchAuthSession, type SignInInput, type SignUpInput } from 'aws-amplify/auth';

export interface AuthUser {
    username: string;
    userId: string;
    email?: string;
    attributes?: Record<string, string>;
}

export interface SignInResult {
    success: boolean;
    user?: AuthUser;
    nextStep?: string;
    error?: string;
}

export interface SignUpResult {
    success: boolean;
    userId?: string;
    nextStep?: string;
    error?: string;
}

export interface ResetPasswordResult {
    success: boolean;
    nextStep?: string;
    error?: string;
}

class AuthService {
    /**
     * Sign in a user with username and password
     */
    async signIn(username: string, password: string): Promise<SignInResult> {
        try {
            const signInInput: SignInInput = {
                username,
                password,
            };

            const { isSignedIn, nextStep } = await signIn(signInInput);

            if (isSignedIn) {
                const user = await this.getCurrentUser();
                return {
                    success: true,
                    user: user || undefined,
                    nextStep: nextStep.signInStep,
                };
            }

            return {
                success: false,
                nextStep: nextStep.signInStep,
            };
        } catch (error: any) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: error.message || 'Failed to sign in',
            };
        }
    }

    /**
     * Sign out the current user
     */
    async signOut(): Promise<{ success: boolean; error?: string }> {
        try {
            await signOut();
            return { success: true };
        } catch (error: any) {
            console.error('Sign out error:', error);
            return {
                success: false,
                error: error.message || 'Failed to sign out',
            };
        }
    }

    /**
     * Sign up a new user
     */
    async signUp(
        username: string,
        password: string,
        email: string,
        attributes?: Record<string, string>
    ): Promise<SignUpResult> {
        try {
            const signUpInput: SignUpInput = {
                username,
                password,
                options: {
                    userAttributes: {
                        email,
                        ...attributes,
                    },
                },
            };

            const { isSignUpComplete, userId, nextStep } = await signUp(signUpInput);

            return {
                success: isSignUpComplete,
                userId,
                nextStep: nextStep.signUpStep,
            };
        } catch (error: any) {
            console.error('Sign up error:', error);
            return {
                success: false,
                error: error.message || 'Failed to sign up',
            };
        }
    }

    /**
     * Confirm sign up with verification code
     */
    async confirmSignUp(username: string, confirmationCode: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { isSignUpComplete } = await confirmSignUp({
                username,
                confirmationCode,
            });

            return { success: isSignUpComplete };
        } catch (error: any) {
            console.error('Confirm sign up error:', error);
            return {
                success: false,
                error: error.message || 'Failed to confirm sign up',
            };
        }
    }

    /**
     * Initiate password reset
     */
    async resetPassword(username: string): Promise<ResetPasswordResult> {
        try {
            const { nextStep } = await resetPassword({ username });

            return {
                success: true,
                nextStep: nextStep.resetPasswordStep,
            };
        } catch (error: any) {
            console.error('Reset password error:', error);
            return {
                success: false,
                error: error.message || 'Failed to reset password',
            };
        }
    }

    /**
     * Confirm password reset with code and new password
     */
    async confirmResetPassword(
        username: string,
        confirmationCode: string,
        newPassword: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            await confirmResetPassword({
                username,
                confirmationCode,
                newPassword,
            });

            return { success: true };
        } catch (error: any) {
            console.error('Confirm reset password error:', error);
            return {
                success: false,
                error: error.message || 'Failed to confirm password reset',
            };
        }
    }

    /**
     * Check if user is authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            const session = await fetchAuthSession();
            return !!session.tokens?.accessToken;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get the current authenticated user
     */
    async getCurrentUser(): Promise<AuthUser | null> {
        try {
            // First check if authenticated to avoid throwing errors
            const isAuth = await this.isAuthenticated();
            if (!isAuth) {
                return null;
            }

            const { username, userId, signInDetails } = await getCurrentUser();

            return {
                username,
                userId,
                email: signInDetails?.loginId,
            };
        } catch (error: any) {
            console.error('Get current user error:', error);
            return null;
        }
    }

    /**
     * Get current auth session with tokens
     */
    async getSession(): Promise<{
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
        error?: string;
    }> {
        try {
            const session = await fetchAuthSession();

            return {
                accessToken: session.tokens?.accessToken?.toString(),
                idToken: session.tokens?.idToken?.toString(),
            };
        } catch (error: any) {
            console.error('Get session error:', error);
            return {
                error: error.message || 'Failed to get session',
            };
        }
    }

    /**
     * Get user attributes from the current session
     */
    async getUserAttributes(): Promise<Record<string, string> | null> {
        try {
            const session = await fetchAuthSession();
            const idToken = session.tokens?.idToken;

            if (idToken?.payload) {
                return idToken.payload as Record<string, string>;
            }

            return null;
        } catch (error: any) {
            console.error('Get user attributes error:', error);
            return null;
        }
    }
}

// Export singleton instance
export const authService = new AuthService();
