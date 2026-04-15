'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authService } from '@/lib/auth/authService';
import { initializeAmplify, isAmplifyConfigured } from '@/lib/auth/amplifyConfig';

export default function ProfilePage() {
    const [cognitoUser, setCognitoUser] = useState<{ userId: string; email: string; name: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                await initializeAmplify();
                if (!isAmplifyConfigured()) {
                    console.error('Amplify not configured, skipping auth calls');
                    return;
                }

                const user = await authService.getCurrentUser();
                if (user) {
                    setCognitoUser({
                        userId: user.userId,
                        email: user.email || 'N/A',
                        name: user.email?.split('@')[0] || 'User'
                    });
                }
            } catch (error) {
                console.error('Error fetching user:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUser();
    }, []);

    // Mock data for other fields
    const mockData = {
        name: cognitoUser?.name || 'User',
        role: 'Senior Compliance Analyst',
        department: 'Trading Compliance',
        location: 'New York, NY',
        phone: '+1 (212) 555-0123',
        employeeId: 'EMP-2024-1234',
        joinDate: '2020-03-15',
        lastLogin: new Date().toISOString()
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-5xl">
                <div className="mb-6">
                    <Link href="/" className="inline-flex items-center text-[#232F3E] hover:text-[#007FAA] font-medium transition-colors">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Alerts
                    </Link>
                </div>

                {/* Profile Header */}
                <div className="bg-white rounded-xl card-shadow overflow-hidden mb-6">
                    <div className="bg-gradient-to-r from-[#232F3E] to-[#007FAA] px-4 py-6 md:px-8 md:py-8">
                        <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:items-center sm:space-x-6">
                            <div className="w-20 h-20 sm:w-32 sm:h-32 bg-gradient-to-br from-white/20 to-white/10 rounded-full flex items-center justify-center border-4 border-white shadow-lg flex-shrink-0 mb-3 sm:mb-0">
                                <span className="text-white font-bold text-2xl sm:text-4xl">
                                    {mockData.name.split(' ').map(n => n[0]).join('')}
                                </span>
                            </div>
                            <div className="flex-1">
                                <h1 className="text-xl sm:text-3xl font-bold text-white mb-1">{mockData.name}</h1>
                                <p className="text-base sm:text-lg text-white/90">{mockData.role}</p>
                                <p className="text-sm text-white/80">{mockData.department}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <div className="bg-white rounded-xl p-4 md:p-8 card-shadow">
                        <h2 className="text-xl font-bold text-[#232F3E] mb-6">Personal Information</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-500">Full Name</label>
                                <p className="text-base text-gray-900 mt-1">{mockData.name}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Email Address</label>
                                {isLoading ? (
                                    <p className="text-base text-gray-400 mt-1">Loading...</p>
                                ) : (
                                    <p className="text-base text-gray-900 mt-1">{cognitoUser?.email || 'N/A'}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Phone Number</label>
                                <p className="text-base text-gray-900 mt-1">{mockData.phone}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Location</label>
                                <p className="text-base text-gray-900 mt-1">{mockData.location}</p>
                            </div>
                        </div>
                    </div>

                    {/* Employment Information */}
                    <div className="bg-white rounded-xl p-4 md:p-8 card-shadow">
                        <h2 className="text-xl font-bold text-[#232F3E] mb-6">Employment Information</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-500">Employee ID</label>
                                <p className="text-base text-gray-900 mt-1 font-mono">{mockData.employeeId}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Role</label>
                                <p className="text-base text-gray-900 mt-1">{mockData.role}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Department</label>
                                <p className="text-base text-gray-900 mt-1">{mockData.department}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Join Date</label>
                                <p className="text-base text-gray-900 mt-1">
                                    {new Date(mockData.joinDate).toLocaleDateString('en-US', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Account Information */}
                    <div className="bg-white rounded-xl p-4 md:p-8 card-shadow md:col-span-2">
                        <h2 className="text-xl font-bold text-[#232F3E] mb-6">Account Information</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-sm font-medium text-gray-500">Cognito User ID</label>
                                {isLoading ? (
                                    <p className="text-base text-gray-400 mt-1">Loading...</p>
                                ) : (
                                    <p className="text-base text-gray-900 mt-1 font-mono text-sm break-all">
                                        {cognitoUser?.userId || 'N/A'}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Last Login</label>
                                <p className="text-base text-gray-900 mt-1">
                                    {new Date(mockData.lastLogin).toLocaleString('en-US', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
