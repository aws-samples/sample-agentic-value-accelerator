/**
 * useAuth Hook
 * 
 * React hook for managing authentication state and operations
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { authService, type AuthUser } from './authService';
import { Hub } from 'aws-amplify/utils';

interface UseAuthReturn {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    signIn: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signOut: () => Promise<void>;
    signUp: (username: string, password: string, email: string) => Promise<{ success: boolean; error?: string }>;
    resetPassword: (username: string) => Promise<{ success: boolean; error?: string }>;
    refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load current user on mount
    const loadUser = useCallback(async () => {
        try {
            setIsLoading(true);
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
        } catch (error) {
            console.error('Error loading user:', error);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUser();

        // Listen to auth events
        const hubListener = Hub.listen('auth', ({ payload }) => {
            switch (payload.event) {
                case 'signedIn':
                    console.log('User signed in');
                    loadUser();
                    break;
                case 'signedOut':
                    console.log('User signed out');
                    setUser(null);
                    break;
                case 'tokenRefresh':
                    console.log('Token refreshed');
                    break;
                case 'tokenRefresh_failure':
                    console.error('Token refresh failed');
                    setUser(null);
                    break;
                case 'signInWithRedirect':
                    console.log('Sign in with redirect');
                    loadUser();
                    break;
            }
        });

        return () => hubListener();
    }, [loadUser]);

    const signIn = async (username: string, password: string) => {
        try {
            const result = await authService.signIn(username, password);

            if (result.success && result.user) {
                setUser(result.user);
                return { success: true };
            }

            return {
                success: false,
                error: result.error || 'Sign in failed',
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Sign in failed',
            };
        }
    };

    const signOut = async () => {
        try {
            await authService.signOut();
            setUser(null);
        } catch (error) {
            console.error('Sign out error:', error);
        }
    };

    const signUp = async (username: string, password: string, email: string) => {
        try {
            const result = await authService.signUp(username, password, email);

            return {
                success: result.success,
                error: result.error,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Sign up failed',
            };
        }
    };

    const resetPassword = async (username: string) => {
        try {
            const result = await authService.resetPassword(username);

            return {
                success: result.success,
                error: result.error,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Password reset failed',
            };
        }
    };

    const refreshUser = async () => {
        await loadUser();
    };

    return {
        user,
        isLoading,
        isAuthenticated: user !== null,
        signIn,
        signOut,
        signUp,
        resetPassword,
        refreshUser,
    };
}
