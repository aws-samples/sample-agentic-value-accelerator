'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authService } from '@/lib/auth/authService';
import { isAmplifyConfigured, initializeAmplify } from '@/lib/auth/amplifyConfig';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        // Check if user is already signed in
        const checkAuth = async () => {
            const isAuthenticated = await authService.isAuthenticated();
            if (isAuthenticated) {
                // Get redirect URL from query params or default to home
                const params = new URLSearchParams(window.location.search);
                const redirectTo = params.get('redirect') || '/select-domain';
                router.push(redirectTo);
            } else {
                // Not authenticated, show login form
                setIsCheckingAuth(false);
            }
        };
        checkAuth();
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Guard: ensure Amplify is configured before calling signIn
            if (!isAmplifyConfigured()) {
                await initializeAmplify();
                if (!isAmplifyConfigured()) {
                    setError('Authentication service is not configured. Please contact your administrator.');
                    setIsLoading(false);
                    return;
                }
            }

            const result = await authService.signIn(username, password);

            if (result.success) {
                console.log('Login successful:', result.user);
                // Get redirect URL from query params or default to home
                const params = new URLSearchParams(window.location.search);
                const redirectTo = params.get('redirect') || '/select-domain';
                router.push(redirectTo);
            } else {
                setError(result.error || 'Failed to sign in. Please check your credentials.');
            }
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Show loading state while checking authentication
    if (isCheckingAuth) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#232F3E] via-[#005276] to-[#007FAA] flex items-center justify-center p-6">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p className="text-white text-sm">Checking authentication...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#232F3E] via-[#005276] to-[#007FAA] flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Logo and Title */}
                <div className="text-center mb-8">
                    <div className="bg-white rounded-2xl p-6 inline-block mb-6 shadow-2xl">
                        <Image
                            src="/aws_logo.png"
                            alt="Market Surveillance"
                            width={200}
                            height={67}
                            className="h-16 w-auto"
                            priority
                        />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Market Surveillance</h1>
                    <p className="text-white/80">Sign in to access the platform</p>
                </div>

                {/* Login Form */}
                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    {error && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-start">
                                <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm text-red-800">{error}</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        {/* Username Field */}
                        <div>
                            <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
                                Username
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter your username"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007FAA] focus:border-transparent"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007FAA] focus:border-transparent"
                                    required
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    disabled={isLoading}
                                >
                                    {showPassword ? (
                                        <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Login Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#007FAA] text-white py-3 rounded-lg font-semibold hover:bg-[#005276] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Additional Info */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <p className="text-center text-sm text-gray-600">
                            Secured by AWS Cognito
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-white/60 text-sm">
                    <p>© 2026 Market Surveillance Portal. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
}
