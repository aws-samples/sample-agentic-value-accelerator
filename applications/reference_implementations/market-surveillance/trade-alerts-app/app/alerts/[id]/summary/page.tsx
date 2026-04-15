'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { summariesService, type SummaryData } from '@/lib/api';
import { authService } from '@/lib/auth/authService';

export default function AlertSummaryPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [summaryHistory, setSummaryHistory] = useState<SummaryData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedAudit, setExpandedAudit] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedInvestigationId, setSelectedInvestigationId] = useState<string | null>(null);
    const [isTriggering, setIsTriggering] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);
    const [triggerError, setTriggerError] = useState<string | null>(null);

    // Helper function to format timestamp with date if not today
    const formatTimestamp = (timestamp: string): string => {
        const date = new Date(timestamp);
        const today = new Date();
        
        // Check if the date is today
        const isToday = date.getDate() === today.getDate() &&
                       date.getMonth() === today.getMonth() &&
                       date.getFullYear() === today.getFullYear();
        
        if (isToday) {
            // Just show time for today's messages
            return date.toLocaleTimeString();
        } else {
            // Show date and time for older messages
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit'
            });
        }
    };

    // Check authentication on mount
    useEffect(() => {
        const checkAuth = async () => {
            const isAuthenticated = await authService.isAuthenticated();
            if (!isAuthenticated) {
                // Redirect to login with current page as redirect target
                router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
                return;
            }
            setIsCheckingAuth(false);
        };

        checkAuth();
    }, [router]);

    // Fetch summary data
    useEffect(() => {
        if (isCheckingAuth) return;

        const fetchSummary = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Fetch summary and history in a single API call
                const response = await summariesService.getLatestSummary(id);

                if (response && response.summary) {
                    setSummary(response.summary);

                    // History is now included in the same response
                    if (response.summaries && response.summaries.length > 0) {
                        setSummaryHistory(response.summaries);
                        console.log(`Loaded ${response.summaries.length} summary versions`);
                    }
                } else {
                    // No summary found
                    console.log('No summary found for alert', id);
                    setError('No investigation summary available for this alert');
                }
            } catch (err) {
                console.error('Error fetching summary:', err);
                setError('Failed to load investigation summary');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSummary();
    }, [id, isCheckingAuth]);

    // Trigger investigation
    const handleTriggerInvestigation = async () => {
        try {
            setIsTriggering(true);
            setTriggerError(null);
            setTriggerSuccess(false);

            const { triggerInvestigation } = await import('@/lib/api/alertsService');
            const result = await triggerInvestigation({ alertId: id });

            if (result.success) {
                setTriggerSuccess(true);
                // Auto-reload after 2 seconds to show pending state
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                setTriggerError(result.message || 'Failed to trigger investigation');
            }
        } catch (err: any) {
            console.error('Error triggering investigation:', err);
            setTriggerError(err.message || 'Failed to trigger investigation');
        } finally {
            setIsTriggering(false);
        }
    };

    // Show loading while checking authentication
    if (isCheckingAuth) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007FAA] mx-auto mb-4"></div>
                    <p className="text-sm text-gray-600">Checking authentication...</p>
                </div>
            </div>
        );
    }

    // Show loading while fetching data
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007FAA] mx-auto mb-4"></div>
                    <p className="text-sm text-gray-600">Loading investigation summary...</p>
                </div>
            </div>
        );
    }

    // No summary exists — redirect back to alert detail where user can trigger investigation
    if (!summary) {
        router.push(`/alerts/${id}`);
        return null;
    }

    // Check if investigation is pending
    const isPending = summary?.status === 'pending';

    // Get the summary to display (selected investigation or latest)
    const displaySummary = selectedInvestigationId !== null
        ? summaryHistory.find(s => s.investigationId === selectedInvestigationId) || summary
        : summary;

    const isFailed = displaySummary?.status === 'failed';

    // Show pending state
    if (isPending) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto px-6 py-8 max-w-[1400px]">
                    {/* Header */}
                    <div className="mb-6">
                        <Link href={`/alerts/${id}`} className="inline-flex items-center text-[#232F3E] hover:text-[#007FAA] font-medium transition-colors mb-4">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to Alert Detail
                        </Link>
                        <h1 className="text-2xl font-bold text-[#007FAA]">Investigation In Progress</h1>
                        <p className="text-sm text-gray-600 mt-1">Alert #{id}</p>
                    </div>

                    {/* Pending Investigation Card */}
                    <div className="bg-white rounded-lg border-2 border-blue-200 shadow-lg">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-t-lg">
                            <div className="flex items-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                                <h2 className="text-lg font-semibold">AI Agent is Investigating</h2>
                            </div>
                        </div>
                        <div className="p-8 text-center">
                            <svg className="w-20 h-20 text-blue-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Investigation in Progress</h3>
                            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
                                The AI agent is currently conducting a comprehensive market surveillance investigation for this alert.
                                This step takes approximately a few minutes to complete.
                            </p>

                            {/* Investigation Details */}
                            <div className="bg-gray-50 rounded-lg p-6 mb-6 max-w-2xl mx-auto">
                                <div className="grid grid-cols-2 gap-4 text-left">
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Investigation ID</div>
                                        <div className="text-sm font-mono text-gray-800">{summary.investigationId || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Started At</div>
                                        <div className="text-sm text-gray-800">
                                            {new Date(summary.triggeredAt || summary.generatedAt).toLocaleString()}
                                        </div>
                                    </div>
                                    {summary.triggeredByUser && (
                                        <div className="col-span-2">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Triggered By</div>
                                            <div className="text-sm text-gray-800">{summary.triggeredByUser}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-3 bg-[#232F3E] text-white rounded-lg font-medium hover:bg-[#005276] transition-colors flex items-center justify-center"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh Page
                                </button>
                                <Link 
                                    href="/"
                                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
                                >
                                    Back to Alert List
                                </Link>
                            </div>

                            <p className="text-xs text-gray-500 mt-6">
                                The page will not auto-refresh. Please click "Refresh Page" to check if the investigation has completed.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-[1400px]">
                {/* Header */}
                <div className="mb-6">
                    <Link href={`/alerts/${id}`} className="inline-flex items-center text-[#232F3E] hover:text-[#007FAA] font-medium transition-colors mb-4">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Alert Detail
                    </Link>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-[#007FAA]">{isFailed ? 'Investigation Summary (Failed)' : 'Investigation Summary'}</h1>
                            <p className="text-sm text-gray-600 mt-1">Alert #{id}</p>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            {summaryHistory.length > 1 && (
                                <button
                                    onClick={() => setShowHistory(!showHistory)}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center"
                                >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {showHistory ? 'Hide' : 'Show'} History ({summaryHistory.length} versions)
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Metadata Bar */}
                    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm mt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:items-center gap-4 lg:gap-6">
                            {/* Version Badge */}
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                                <div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Version</div>
                                    <div className="text-sm font-semibold text-gray-900">{displaySummary?.version || 1}</div>
                                </div>
                            </div>

                            {/* Execution Time */}
                            {displaySummary?.triggeredAt && displaySummary?.completedAt && (
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide">Execution Time</div>
                                        <div className="text-sm font-semibold text-gray-900">
                                            {(() => {
                                                const ms = new Date(displaySummary.completedAt!).getTime() - new Date(displaySummary.triggeredAt!).getTime();
                                                if (ms < 0) return '—';
                                                const totalSec = Math.floor(ms / 1000);
                                                const min = Math.floor(totalSec / 60);
                                                const sec = totalSec % 60;
                                                return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Generated Date */}
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Generated</div>
                                    <div className="text-sm font-medium text-gray-900">
                                        {displaySummary && new Date(displaySummary.generatedAt).toLocaleDateString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric', 
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Triggered By (if available) */}
                            {displaySummary?.triggeredByUser && (
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide">Triggered By</div>
                                        <div className="text-sm font-medium text-gray-900">{displaySummary.triggeredByUser}</div>
                                    </div>
                                </div>
                            )}

                            {/* Generated By */}
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Generated By</div>
                                    <div className="text-sm font-medium text-gray-900">
                                        {displaySummary?.generatedBy === 'async-agent' ? 'AI Agent' : displaySummary?.generatedBy || 'AI Agent'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Failed Investigation Banner */}
                {isFailed && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <h3 className="text-sm font-semibold text-red-800">Investigation Failed</h3>
                                    <p className="text-sm text-red-700 mt-0.5">
                                        The AI agent encountered errors during this investigation. Available data is shown below.
                                    </p>
                                    {displaySummary?.errorMessage && (
                                        <p className="text-xs text-red-600 font-mono mt-2">{displaySummary.errorMessage}</p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={handleTriggerInvestigation}
                                disabled={isTriggering}
                                className="px-4 py-2 bg-[#007FAA] text-white rounded-lg text-sm font-medium hover:bg-[#005276] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                            >
                                {isTriggering ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Retrying...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Retry Investigation
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Summary History Timeline */}
                {showHistory && summaryHistory.length > 1 && (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
                        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 rounded-t-lg">
                            <div className="flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h2 className="text-base font-semibold">Investigation History</h2>
                                <span className="ml-3 bg-white text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
                                    {summaryHistory.length} versions
                                </span>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="space-y-3">
                                {summaryHistory.map((historySummary, index) => {
                                    const isSelected = selectedInvestigationId === historySummary.investigationId;
                                    const isLatest = index === 0;

                                    return (
                                        <button
                                            key={historySummary.investigationId || index}
                                            onClick={() => setSelectedInvestigationId(isSelected ? null : (historySummary.investigationId || null))}
                                            className={`w-full text-left relative pl-8 pb-4 border-l-2 last:border-l-0 last:pb-0 transition-all ${isSelected
                                                    ? 'border-indigo-600'
                                                    : 'border-gray-200 hover:border-indigo-400'
                                                }`}
                                        >
                                            <div className={`absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white ${isSelected ? 'bg-indigo-600' : 'bg-gray-400'
                                                }`}></div>

                                            <div className={`rounded-lg p-4 border-2 transition-all ${isSelected
                                                    ? 'bg-indigo-50 border-indigo-600'
                                                    : 'bg-gray-50 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
                                                }`}>
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-sm font-bold px-3 py-1 rounded ${isLatest
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-gray-100 text-gray-700'
                                                            }`}>
                                                            Version {historySummary.version}
                                                        </span>
                                                        {isLatest && (
                                                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-medium">
                                                                LATEST
                                                            </span>
                                                        )}
                                                        {isSelected && (
                                                            <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded font-medium">
                                                                VIEWING
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(historySummary.generatedAt).toLocaleString()}
                                                    </span>
                                                </div>

                                                <div className="text-sm text-gray-700 mb-2">
                                                    <span className="font-medium">Generated by:</span> {historySummary.generatedBy || 'async-agent'}
                                                </div>

                                                <div className="flex items-center gap-4 text-xs text-gray-600">
                                                    <div className="flex items-center">
                                                        <svg className="w-4 h-4 mr-1 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                        </svg>
                                                        {historySummary.findings?.length || 0} findings
                                                    </div>
                                                    <div className="flex items-center">
                                                        <svg className="w-4 h-4 mr-1 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        {historySummary.recommendations?.length || 0} recommendations
                                                    </div>
                                                    {historySummary.asyncAuditTrail && (
                                                        <div className="flex items-center">
                                                            <svg className="w-4 h-4 mr-1 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                            </svg>
                                                            {historySummary.asyncAuditTrail.length} audit entries
                                                        </div>
                                                    )}
                                                </div>

                                                {isSelected && (
                                                    <div className="mt-3 pt-3 border-t border-indigo-200">
                                                        <p className="text-xs text-indigo-700 font-medium">
                                                            Click again to return to latest version
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Investigation Summary */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
                    <div className="bg-gradient-to-r from-[#007FAA] to-[#005276] text-white px-6 py-4 rounded-t-lg">
                        <div className="flex items-center">
                            <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h2 className="text-lg font-semibold">Investigation Summary</h2>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{displaySummary?.summaryText || ''}</ReactMarkdown>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Key Findings */}
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-6 py-4 rounded-t-lg">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <h2 className="text-base font-semibold">Key Findings</h2>
                                </div>
                                <span className="bg-white text-yellow-600 px-3 py-1 rounded-full text-xs font-bold">
                                    {displaySummary?.findings?.length || 0}
                                </span>
                            </div>
                        </div>
                        <div className="p-6">
                            <ul className="space-y-3">
                                {(displaySummary?.findings || []).map((finding, index) => (
                                    <li key={index} className="flex items-start">
                                        <span className="flex-shrink-0 w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                                            {index + 1}
                                        </span>
                                        <span className="text-sm text-gray-700 leading-relaxed">{finding}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                        <div className="bg-gradient-to-r from-[#232F3E] to-[#005276] text-white px-6 py-4 rounded-t-lg">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <h2 className="text-base font-semibold">Recommendations</h2>
                                </div>
                                <span className="bg-white text-[#232F3E] px-3 py-1 rounded-full text-xs font-bold">
                                    {displaySummary?.recommendations?.length || 0}
                                </span>
                            </div>
                        </div>
                        <div className="p-6">
                            <ul className="space-y-3">
                                {(displaySummary?.recommendations || []).map((recommendation, index) => (
                                    <li key={index} className="flex items-start">
                                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                                            {index + 1}
                                        </span>
                                        <span className="text-sm text-gray-700 leading-relaxed">{recommendation}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Investigation Audit Trail */}
                {displaySummary?.asyncAuditTrail && displaySummary.asyncAuditTrail.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
                        <button
                            onClick={() => setExpandedAudit(!expandedAudit)}
                            className="w-full bg-gradient-to-r from-gray-700 to-gray-800 text-white px-6 py-4 rounded-t-lg flex items-center justify-between hover:from-gray-800 hover:to-gray-900 transition-colors"
                        >
                            <div className="flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                                <h2 className="text-base font-semibold">Investigation Audit Trail</h2>
                                <span className="ml-3 bg-white text-gray-700 px-3 py-1 rounded-full text-xs font-bold">
                                    {displaySummary!.asyncAuditTrail!.length} steps
                                </span>
                            </div>
                            <svg
                                className={`w-5 h-5 transition-transform ${expandedAudit ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {expandedAudit && (
                            <div className="p-6">
                                <div className="space-y-3">
                                    {displaySummary!.asyncAuditTrail!.map((entry, index) => (
                                        <div key={index} className="relative pl-8 pb-4 border-l-2 border-gray-200 last:border-l-0 last:pb-0">
                                            <div className="absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-gray-700 border-2 border-white"></div>
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 min-w-0">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-xs font-medium px-2 py-1 rounded ${entry.type === 'thinking' ? 'bg-blue-100 text-blue-800' :
                                                            entry.type === 'decision' ? 'bg-indigo-100 text-indigo-800' :
                                                                entry.type === 'tool_call' ? 'bg-purple-100 text-purple-800' :
                                                                    entry.type === 'agent_routing' ? 'bg-orange-100 text-orange-800' :
                                                                        'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {entry.type.replace('_', ' ').toUpperCase()}
                                                        </span>
                                                        {entry.metadata?.agent && (
                                                            <span className="text-xs font-semibold text-gray-700 bg-white px-2 py-1 rounded border border-gray-300">
                                                                {entry.metadata.agent}
                                                            </span>
                                                        )}
                                                        {entry.metadata?.step && (
                                                            <span className="text-xs text-gray-500">
                                                                Step {entry.metadata.step}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-500 shrink-0">
                                                        {formatTimestamp(entry.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-700 font-medium mb-2">
                                                    {entry.content}
                                                </p>
                                                
                                                {/* Display SQL Query if present */}
                                                {entry.metadata?.sql_query && (
                                                    <div className="mt-3 min-w-0">
                                                        <div className="text-xs font-semibold text-gray-600 mb-1">SQL Query:</div>
                                                        <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded overflow-x-auto border border-gray-700 max-w-full">
                                                            <code>{entry.metadata.sql_query}</code>
                                                        </pre>
                                                    </div>
                                                )}
                                                
                                                {/* Display Python Code if present */}
                                                {entry.metadata?.python_code && (
                                                    <div className="mt-3 min-w-0">
                                                        <div className="text-xs font-semibold text-gray-600 mb-1">Python Code:</div>
                                                        <pre className="text-xs bg-gray-900 text-blue-400 p-3 rounded overflow-x-auto border border-gray-700 max-w-full">
                                                            <code>{entry.metadata.python_code}</code>
                                                        </pre>
                                                    </div>
                                                )}
                                                
                                                {entry.metadata && Object.keys(entry.metadata).filter(k => !['agent', 'step', 'sql_query', 'python_code'].includes(k)).length > 0 && (
                                                    <details className="mt-2">
                                                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center">
                                                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            Additional details
                                                        </summary>
                                                        <div className="text-xs bg-white p-3 rounded mt-2 border border-gray-200 space-y-1">
                                                            {Object.entries(entry.metadata)
                                                                .filter(([key]) => !['agent', 'step', 'sql_query', 'python_code'].includes(key))
                                                                .map(([key, value]) => (
                                                                    <div key={key}>
                                                                        <span className="font-medium text-gray-700">{key.replace(/_/g, ' ')}:</span>
                                                                        <span className="text-gray-600 ml-2">
                                                                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 sm:justify-end">
                    <Link
                        href={`/alerts/${id}/chat`}
                        className="px-6 py-3 bg-white border-2 border-[#007FAA] text-[#007FAA] rounded-lg font-medium hover:bg-[#007FAA] hover:text-white transition-colors flex items-center"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Chat with AI Agent
                    </Link>
                    <button
                        onClick={() => window.print()}
                        className="px-6 py-3 bg-[#007FAA] text-white rounded-lg font-medium hover:bg-[#005276] transition-colors flex items-center"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Export Report
                    </button>
                </div>
            </div>
        </div>
    );
}
