'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/auth/authService';
import { useMspChat } from '@/lib/hooks/useMspChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MspPage() {
    const router = useRouter();
    const [input, setInput] = useState('');
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [enlargedImage, setEnlargedImage] = useState<{ base64: string; alt: string } | null>(null);

    const agentResponsesEndRef = useRef<HTMLDivElement>(null);
    const userRequestsEndRef = useRef<HTMLDivElement>(null);

    const formatTimestamp = (timestamp: string): string => {
        const date = new Date(timestamp);
        const today = new Date();
        const isToday = date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();

        if (isToday) {
            return date.toLocaleTimeString();
        }
        return date.toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
            hour: 'numeric', minute: '2-digit', second: '2-digit',
        });
    };

    useEffect(() => {
        const checkAuth = async () => {
            const isAuthenticated = await authService.isAuthenticated();
            if (!isAuthenticated) {
                router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
                return;
            }
            setIsCheckingAuth(false);
        };
        checkAuth();
    }, [router]);

    const {
        messages, isProcessing, error, sendMessage,
        currentStreamingMessage, currentAuditTrail, currentStreamingImages, isLoadingHistory,
    } = useMspChat({ enabled: !isCheckingAuth });

    const [expandedAudits, setExpandedAudits] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (agentResponsesEndRef.current && !isProcessing) {
            agentResponsesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length, isProcessing]);

    useEffect(() => {
        if (userRequestsEndRef.current) {
            userRequestsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.filter(m => m.role === 'user').length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEnlargedImage(null);
        };
        if (enlargedImage) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [enlargedImage]);

    const toggleAudit = (index: number) => {
        setExpandedAudits(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) newSet.delete(index);
            else newSet.add(index);
            return newSet;
        });
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isProcessing) return;
        const messageToSend = input;
        setInput('');
        await sendMessage(messageToSend);
    };

    const ChartImage = ({ img, borderColor }: { img: { base64: string; alt: string }; borderColor: string }) => (
        <div className={`relative group border ${borderColor} rounded-lg overflow-hidden bg-white`}>
            <img
                src={`data:image/png;base64,${img.base64}`}
                alt={img.alt}
                className="w-full max-w-4xl"
            />
            <button
                onClick={() => setEnlargedImage(img)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5"
                title="Enlarge chart"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
            </button>
            <div className={`px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-t ${borderColor}`}>
                {img.alt}
            </div>
        </div>
    );

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

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-[1800px]">
                {/* Header */}
                <div className="mb-6">
                    <Link href="/select-domain" className="inline-flex items-center text-[#232F3E] hover:text-[#007FAA] font-medium transition-colors mb-4">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Domain Selection
                    </Link>
                    <h1 className="text-xl md:text-2xl font-bold text-[#007FAA]">Chat with Risk Analyst Agent</h1>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start">
                            <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-red-800">Error</p>
                                <p className="text-sm text-red-700 mt-1">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content - Split Layout */}
                <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-200px)]">
                    {/* Left Section - Agent Responses (2/3) */}
                    <div className="min-h-[50vh] lg:min-h-0 lg:w-2/3 bg-white rounded-lg border border-gray-200 flex flex-col">
                        <div className="bg-[#007FAA] text-white px-4 py-3 rounded-t-lg">
                            <h2 className="text-sm font-semibold">Agent Responses</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {isLoadingHistory && (
                                <div className="flex items-center justify-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007FAA]" />
                                    <p className="text-sm text-gray-500 ml-3">Loading conversation history...</p>
                                </div>
                            )}

                            {!isLoadingHistory && messages.filter(m => m.role === 'agent').length === 0 && !currentStreamingMessage && (
                                <div className="flex items-center justify-center h-full text-gray-400">
                                    <div className="text-center">
                                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <p className="text-sm">Agent responses will appear here</p>
                                        <p className="text-xs mt-2">Send a message to start the conversation</p>
                                    </div>
                                </div>
                            )}

                            {messages.filter(m => m.role === 'agent').map((message, index) => (
                                <div key={index} className="bg-green-50 border-l-4 border-green-500 rounded">
                                    <div className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-semibold text-sm text-green-800">Risk Analyst</span>
                                            <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                                        </div>
                                        <div className="text-sm markdown-content">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                                        </div>

                                        {/* Chart Images */}
                                        {message.images && message.images.length > 0 && (
                                            <div className="mt-4 space-y-3">
                                                {message.images.map((img, imgIndex) => (
                                                    <ChartImage key={imgIndex} img={img} borderColor="border-green-200" />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Audit Trail */}
                                    {message.auditTrail && message.auditTrail.length > 0 && (
                                        <div className="border-t border-green-200">
                                            <button
                                                onClick={() => toggleAudit(index)}
                                                className="w-full px-4 py-2 flex items-center justify-between text-xs text-green-800 hover:bg-green-100 transition-colors"
                                            >
                                                <span className="flex items-center">
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    View Audit Trail ({message.auditTrail.length} entries)
                                                </span>
                                                <svg className={`w-4 h-4 transition-transform ${expandedAudits.has(index) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {expandedAudits.has(index) && (
                                                <div className="px-4 pb-4 space-y-2">
                                                    {message.auditTrail.map((entry, entryIndex) => (
                                                        <div key={entryIndex} className="bg-white rounded border border-green-200 p-3">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                                        entry.type === 'thinking' ? 'bg-blue-100 text-blue-800' :
                                                                        entry.type === 'decision' ? 'bg-indigo-100 text-indigo-800' :
                                                                        entry.type === 'tool_call' ? 'bg-purple-100 text-purple-800' :
                                                                        entry.type === 'agent_routing' ? 'bg-orange-100 text-orange-800' :
                                                                        entry.type === 'validation' ? 'bg-yellow-100 text-yellow-800' :
                                                                        'bg-gray-100 text-gray-800'
                                                                    }`}>
                                                                        {entry.type.replace('_', ' ').toUpperCase()}
                                                                    </span>
                                                                    {entry.metadata?.agent && (
                                                                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{entry.metadata.agent}</span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs text-gray-500">{formatTimestamp(entry.timestamp)}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-700 font-medium">{entry.content}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Streaming message */}
                            {currentStreamingMessage && (
                                <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded">
                                    <div className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-semibold text-sm text-yellow-800">Risk Analyst</span>
                                            <div className="flex items-center">
                                                <div className="flex space-x-1 mr-2">
                                                    <div className="w-2 h-2 bg-yellow-600 rounded-full animate-bounce"></div>
                                                    <div className="w-2 h-2 bg-yellow-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                                    <div className="w-2 h-2 bg-yellow-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                </div>
                                                <span className="text-xs text-yellow-700 font-medium">Streaming...</span>
                                            </div>
                                        </div>
                                        <div className="text-sm markdown-content">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentStreamingMessage}</ReactMarkdown>
                                        </div>

                                        {/* Streaming Chart Images */}
                                        {currentStreamingImages.length > 0 && (
                                            <div className="mt-4 space-y-3">
                                                {currentStreamingImages.map((img, imgIndex) => (
                                                    <ChartImage key={imgIndex} img={img} borderColor="border-yellow-200" />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {currentAuditTrail.length > 0 && (
                                        <div className="border-t border-yellow-200 bg-yellow-100/50">
                                            <div className="px-4 py-2 flex items-center justify-between text-xs text-yellow-800">
                                                <span className="flex items-center font-medium">
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    Live Audit Trail ({currentAuditTrail.length} entries)
                                                </span>
                                                <span className="flex items-center text-yellow-600">
                                                    <div className="w-2 h-2 bg-yellow-600 rounded-full animate-pulse mr-1.5"></div>
                                                    Live
                                                </span>
                                            </div>
                                            <div className="px-4 pb-4 space-y-2 max-h-96 overflow-y-auto">
                                                {currentAuditTrail.map((entry, entryIndex) => (
                                                    <div key={entryIndex} className="bg-white rounded border border-yellow-200 p-3 animate-fadeIn">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                                entry.type === 'thinking' ? 'bg-blue-100 text-blue-800' :
                                                                entry.type === 'tool_call' ? 'bg-purple-100 text-purple-800' :
                                                                entry.type === 'agent_routing' ? 'bg-orange-100 text-orange-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                                {entry.type.replace('_', ' ').toUpperCase()}
                                                            </span>
                                                            <span className="text-xs text-gray-500">{formatTimestamp(entry.timestamp)}</span>
                                                        </div>
                                                        <div className="text-xs text-gray-700 font-medium">{entry.content}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isProcessing && !currentStreamingMessage && (
                                <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded p-4">
                                    <div className="flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-3"></div>
                                        <span className="text-sm text-gray-700 font-medium">Agent is processing your request...</span>
                                    </div>
                                </div>
                            )}

                            <div ref={agentResponsesEndRef} />
                        </div>
                    </div>

                    {/* Right Section - User Requests & Input (1/3) */}
                    <div className="lg:w-1/3 flex flex-col gap-4 lg:h-full">
                        {/* User Request History */}
                        <div className="bg-white rounded-lg border border-gray-200 flex flex-col min-h-[200px] lg:min-h-0 flex-1">
                            <div className="bg-[#232F3E] text-white px-4 py-3 rounded-t-lg flex-shrink-0">
                                <h2 className="text-sm font-semibold">Your Requests</h2>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                                {messages.filter(m => m.role === 'user').length === 0 && (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        <div className="text-center">
                                            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                            </svg>
                                            <p className="text-xs">Your requests will appear here</p>
                                        </div>
                                    </div>
                                )}
                                {messages.filter(m => m.role === 'user').map((message, index) => (
                                    <div key={index} className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-semibold text-xs text-blue-800">You</span>
                                            <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                                        </div>
                                        <div className="text-xs text-gray-800">{message.content}</div>
                                    </div>
                                ))}
                                <div ref={userRequestsEndRef} />
                            </div>
                        </div>

                        {/* Input Section */}
                        <div className="bg-white rounded-lg border border-gray-200 flex flex-col flex-shrink-0">
                            <div className="bg-[#232F3E] text-white px-4 py-3 rounded-t-lg">
                                <h2 className="text-sm font-semibold">Send Message</h2>
                            </div>
                            <div className="p-4">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Type your risk analysis question or request here..."
                                    className="w-full h-24 lg:h-32 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#007FAA] focus:border-transparent text-sm"
                                    disabled={isProcessing}
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!input.trim() || isProcessing}
                                    className="mt-3 w-full px-4 py-2.5 bg-[#007FAA] text-white rounded-lg text-sm font-medium hover:bg-[#005276] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? 'Processing...' : 'Send Message'}
                                </button>
                                <p className="text-xs text-gray-500 mt-2 text-center">
                                    Press Enter to send, Shift+Enter for new line
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Enlarged Chart Modal */}
            {enlargedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setEnlargedImage(null)}
                >
                    <div
                        className="bg-white rounded-lg max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
                            <span className="text-sm font-medium text-gray-700 truncate mr-4">{enlargedImage.alt}</span>
                            <button
                                onClick={() => setEnlargedImage(null)}
                                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-auto p-4">
                            <img
                                src={`data:image/png;base64,${enlargedImage.base64}`}
                                alt={enlargedImage.alt}
                                className="max-w-full h-auto"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
