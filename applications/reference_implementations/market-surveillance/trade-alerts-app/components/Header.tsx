'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/lib/auth/authService';
import { initializeAmplify } from '@/lib/auth/amplifyConfig';
import { useDomain } from '@/lib/context/DomainContext';
import { DOMAIN_OPTIONS } from '@/types/domain';

export default function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const [showDropdown, setShowDropdown] = useState(false);
    const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { selectedDomain } = useDomain();

    const hideDomainLabel = pathname === '/login' || pathname === '/select-domain';
    const domainLabel = selectedDomain
        ? DOMAIN_OPTIONS.find(d => d.id === selectedDomain)?.name ?? null
        : null;

    useEffect(() => {
        // Don't check auth on login page
        if (pathname === '/login') {
            setIsLoading(false);
            return;
        }

        const checkAuth = async () => {
            try {
                await initializeAmplify();
                const cognitoUser = await authService.getCurrentUser();
                if (cognitoUser) {
                    setUser({
                        name: cognitoUser.email?.split('@')[0] || 'User',
                        email: cognitoUser.email || '',
                        role: 'Compliance Analyst'
                    });
                }
            } catch (error) {
                console.error('Auth check error:', error);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, [pathname]);

    const handleLogout = async () => {
        try {
            await authService.signOut();
            setUser(null);
            router.push('/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    // Don't show header on login page or if not authenticated
    if (pathname === '/login' || !user) {
        return null;
    }

    if (isLoading) {
        return null; // Or a loading skeleton
    }

    return (
        <header className="bg-white border-b border-gray-200 shadow-sm">
            <div className="container mx-auto px-4 md:px-6 py-3 md:py-4">
                <div className="flex items-center justify-between">
                    <Link href="/select-domain" className="flex items-center space-x-4">
                        <Image
                            src="/aws_logo.png"
                            alt="Market Surveillance"
                            width={300}
                            height={100}
                            className="h-10 md:h-16 w-auto"
                            priority
                        />
                        {!hideDomainLabel && domainLabel && (
                            <>
                                <div className="h-8 w-px bg-gray-300"></div>
                                <div className="text-sm text-gray-600 font-medium">{domainLabel}</div>
                            </>
                        )}
                    </Link>

                    {/* User Profile Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="w-10 h-10 bg-gradient-to-br from-[#232F3E] to-[#007FAA] rounded-full flex items-center justify-center">
                                <span className="text-white font-semibold text-sm">
                                    {user.name.split(' ').map(n => n[0]).join('')}
                                </span>
                            </div>
                            <div className="text-left hidden md:block">
                                <p className="text-sm font-semibold text-[#232F3E]">{user.name}</p>
                                <p className="text-xs text-gray-500">{user.role}</p>
                            </div>
                            <svg
                                className={`w-5 h-5 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {/* Dropdown Menu */}
                        {showDropdown && (
                            <>
                                {/* Backdrop to close dropdown */}
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowDropdown(false)}
                                ></div>

                                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-20">
                                    {/* User Info */}
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <p className="text-sm font-semibold text-[#232F3E]">{user.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
                                        <p className="text-xs text-gray-400 mt-1">{user.role}</p>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="py-2">
                                        <Link
                                            href="/profile"
                                            onClick={() => setShowDropdown(false)}
                                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3"
                                        >
                                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            <span>View Profile</span>
                                        </Link>
                                    </div>

                                    {/* Logout */}
                                    <div className="border-t border-gray-100 pt-2">
                                        <button
                                            onClick={handleLogout}
                                            className="w-full px-4 py-2 text-left text-sm text-[#007FAA] hover:bg-blue-50 flex items-center space-x-3 font-medium"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
