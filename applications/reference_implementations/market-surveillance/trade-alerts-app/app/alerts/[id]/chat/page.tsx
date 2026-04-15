'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useAgentChat } from '@/lib/hooks/useAgentChat';
import { authService } from '@/lib/auth/authService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export default function AlertChatPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const [input, setInput] = useState('');
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    
    // Refs for auto-scrolling
    const agentResponsesEndRef = useRef<HTMLDivElement>(null);
    const userRequestsEndRef = useRef<HTMLDivElement>(null);

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

    // Use the agent chat hook - only enable after auth check completes
    const {
        messages,
        isProcessing,
        error,
        sendMessage,
        currentStreamingMessage,
        currentAuditTrail,
        isLoadingHistory
    } = useAgentChat({
        alertId: id,
        enabled: !isCheckingAuth
    });

    // Track which audit trails are expanded
    const [expandedAudits, setExpandedAudits] = useState<Set<number>>(new Set());

    // Auto-scroll to bottom ONLY when new complete messages arrive (not during streaming)
    useEffect(() => {
        // Only scroll when messages change (new complete message), not during streaming
        if (agentResponsesEndRef.current && !isProcessing) {
            agentResponsesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length, isProcessing]); // Only depend on message count, not content

    // Auto-scroll user requests to bottom when new user messages arrive
    useEffect(() => {
        if (userRequestsEndRef.current) {
            userRequestsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.filter(m => m.role === 'user').length]);

    // Scroll to bottom on initial page load
    useEffect(() => {
        if (!isCheckingAuth && !isLoadingHistory) {
            setTimeout(() => {
                if (agentResponsesEndRef.current) {
                    agentResponsesEndRef.current.scrollIntoView({ behavior: 'auto' });
                }
                if (userRequestsEndRef.current) {
                    userRequestsEndRef.current.scrollIntoView({ behavior: 'auto' });
                }
            }, 100);
        }
    }, [isCheckingAuth, isLoadingHistory]);

    const toggleAudit = (index: number) => {
        setExpandedAudits(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isProcessing) return;

        const messageToSend = input;
        setInput(''); // Clear input immediately

        await sendMessage(messageToSend);
    };

    const handleQuickAction = (action: string) => {
        setInput(action);
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

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-[1800px]">
                {/* Header */}
                <div className="mb-6">
                    <Link href={`/alerts/${id}`} className="inline-flex items-center text-[#232F3E] hover:text-[#007FAA] font-medium transition-colors mb-4">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Alert Detail
                    </Link>
                    <h1 className="text-xl md:text-2xl font-bold text-[#007FAA]">Chat with AI Agent - Alert #{id}</h1>
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
                                    <div className="text-center">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                                        <p className="text-sm text-gray-600">Loading conversation history...</p>
                                    </div>
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
                                            <span className="font-semibold text-sm text-green-800">AI Agent</span>
                                            <span className="text-xs text-gray-500">
                                                {formatTimestamp(message.timestamp)}
                                            </span>
                                        </div>
                                        <div className="text-sm markdown-content">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                                {message.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* Audit Trail Section */}
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
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${expandedAudits.has(index) ? 'rotate-180' : ''}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {expandedAudits.has(index) && (
                                                <div className="px-4 pb-4 space-y-2">
                                                    {message.auditTrail.map((entry, entryIndex) => (
                                                        <div key={entryIndex} className="bg-white rounded border border-green-200 p-3">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${entry.type === 'thinking' ? 'bg-blue-100 text-blue-800' :
                                                                        entry.type === 'decision' ? 'bg-indigo-100 text-indigo-800' :
                                                                            entry.type === 'tool_call' ? 'bg-purple-100 text-purple-800' :
                                                                                entry.type === 'agent_routing' ? 'bg-orange-100 text-orange-800' :
                                                                                    entry.type === 'validation' ? 'bg-yellow-100 text-yellow-800' :
                                                                                        'bg-gray-100 text-gray-800'
                                                                        }`}>
                                                                        {entry.type.replace('_', ' ').toUpperCase()}
                                                                    </span>
                                                                    {entry.metadata?.agent && (
                                                                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                                                                            {entry.metadata.agent}
                                                                        </span>
                                                                    )}
                                                                    {entry.metadata?.step && (
                                                                        <span className="text-xs text-gray-500">
                                                                            Step {entry.metadata.step}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs text-gray-500">
                                                                    {formatTimestamp(entry.timestamp)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-700 font-medium">
                                                                {entry.content}
                                                            </div>
                                                            {entry.metadata && Object.keys(entry.metadata).filter(k => k !== 'agent' && k !== 'step').length > 0 && (
                                                                <details className="mt-2">
                                                                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center">
                                                                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                        View all metadata
                                                                    </summary>
                                                                    <div className="text-xs bg-gray-50 p-3 rounded mt-2 space-y-2">
                                                                        {/* Augmented Data Section */}
                                                                        {(entry.metadata.purpose || entry.metadata.input_summary || entry.metadata.reason || entry.metadata.action || entry.metadata.decision) && (
                                                                            <div className="space-y-1.5">
                                                                                <div className="font-semibold text-gray-700 text-xs uppercase tracking-wide border-b border-gray-300 pb-1">
                                                                                    Summary & Context
                                                                                </div>
                                                                                {entry.metadata.decision && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Decision:</span>
                                                                                        <span className="text-gray-600 ml-1">{entry.metadata.decision}</span>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.reason && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Reason:</span>
                                                                                        <span className="text-gray-600 ml-1">{entry.metadata.reason}</span>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.purpose && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Purpose:</span>
                                                                                        <span className="text-gray-600 ml-1">{entry.metadata.purpose}</span>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.action && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Action:</span>
                                                                                        <span className="text-gray-600 ml-1">{entry.metadata.action}</span>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.input_summary && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Input Summary:</span>
                                                                                        {/* Check if input_summary looks like SQL (contains SELECT, FROM, etc.) */}
                                                                                        {entry.metadata.input_summary.toUpperCase().includes('SELECT') || 
                                                                                         entry.metadata.input_summary.toUpperCase().includes('FROM') ? (
                                                                                            <pre className="text-xs bg-slate-900 text-green-400 p-2 rounded border border-gray-300 overflow-x-auto mt-1 font-mono">
                                                                                                {entry.metadata.input_summary}
                                                                                            </pre>
                                                                                        ) : (
                                                                                            <span className="text-gray-600 ml-1">{entry.metadata.input_summary}</span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {/* Raw Data Section */}
                                                                        {(entry.metadata.tool_id || entry.metadata.function_name || entry.metadata.function_arguments || entry.metadata.sql_query || entry.metadata.python_code || entry.metadata.tool_name || entry.metadata.tool_input || entry.metadata.target_agent || entry.metadata.query || entry.metadata.stop_reason) && (
                                                                            <div className="space-y-1.5">
                                                                                <div className="font-semibold text-gray-700 text-xs uppercase tracking-wide border-b border-gray-300 pb-1">
                                                                                    Technical Details
                                                                                </div>
                                                                                {entry.metadata.tool_id && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Tool ID:</span>
                                                                                        <code className="text-gray-600 ml-1 bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{entry.metadata.tool_id}</code>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.target_agent && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Target Agent:</span>
                                                                                        <span className="text-gray-600 ml-1">{entry.metadata.target_agent}</span>
                                                                                    </div>
                                                                                )}
                                                                                {(entry.metadata.function_name || entry.metadata.tool_name) && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Function Name:</span>
                                                                                        <code className="text-purple-700 ml-1 bg-purple-50 px-1.5 py-0.5 rounded">{entry.metadata.function_name || entry.metadata.tool_name}</code>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.query && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Query:</span>
                                                                                        <div className="text-gray-600 mt-1 bg-white p-2 rounded border border-gray-200 whitespace-pre-wrap break-words">
                                                                                            {entry.metadata.query}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                                {entry.metadata.stop_reason && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700">Stop Reason:</span>
                                                                                        <span className="text-gray-600 ml-1">{entry.metadata.stop_reason}</span>
                                                                                    </div>
                                                                                )}
                                                                                
                                                                                {/* SQL Query - Explicit field */}
                                                                                {entry.metadata.sql_query && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700 block mb-1">SQL Query:</span>
                                                                                        <pre className="text-xs bg-slate-900 text-green-400 p-3 rounded border border-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono">
                                                                                            {entry.metadata.sql_query}
                                                                                        </pre>
                                                                                    </div>
                                                                                )}
                                                                                
                                                                                {/* Python Code - Explicit field */}
                                                                                {entry.metadata.python_code && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700 block mb-1">Python Code:</span>
                                                                                        <pre className="text-xs bg-slate-900 text-blue-400 p-3 rounded border border-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono">
                                                                                            {entry.metadata.python_code}
                                                                                        </pre>
                                                                                    </div>
                                                                                )}
                                                                                
                                                                                {/* Function Arguments - Explicit field */}
                                                                                {entry.metadata.function_arguments && !entry.metadata.sql_query && !entry.metadata.python_code && (
                                                                                    <div className="pl-2">
                                                                                        <span className="font-medium text-gray-700 block mb-1">Function Arguments:</span>
                                                                                        <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto">
                                                                                            {typeof entry.metadata.function_arguments === 'string'
                                                                                                ? entry.metadata.function_arguments
                                                                                                : JSON.stringify(entry.metadata.function_arguments, null, 2)}
                                                                                        </pre>
                                                                                    </div>
                                                                                )}
                                                                                
                                                                                {/* Tool Input - Fallback if function_arguments not present */}
                                                                                {entry.metadata.tool_input && !entry.metadata.function_arguments && !entry.metadata.sql_query && !entry.metadata.python_code && (
                                                                                    <div className="pl-2">
                                                                                        {/* Check if tool_input contains sql_query or code */}
                                                                                        {(() => {
                                                                                            const toolInput = typeof entry.metadata.tool_input === 'string' 
                                                                                                ? JSON.parse(entry.metadata.tool_input) 
                                                                                                : entry.metadata.tool_input;
                                                                                            const sqlQuery = toolInput?.sql_query;
                                                                                            const pythonCode = toolInput?.code;
                                                                                            
                                                                                            if (sqlQuery) {
                                                                                                return (
                                                                                                    <>
                                                                                                        <span className="font-medium text-gray-700 block mb-1">SQL Query:</span>
                                                                                                        <pre className="text-xs bg-slate-900 text-green-400 p-3 rounded border border-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono">
                                                                                                            {sqlQuery}
                                                                                                        </pre>
                                                                                                    </>
                                                                                                );
                                                                                            }
                                                                                            
                                                                                            if (pythonCode) {
                                                                                                return (
                                                                                                    <>
                                                                                                        <span className="font-medium text-gray-700 block mb-1">Python Code:</span>
                                                                                                        <pre className="text-xs bg-slate-900 text-blue-400 p-3 rounded border border-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono">
                                                                                                            {pythonCode}
                                                                                                        </pre>
                                                                                                    </>
                                                                                                );
                                                                                            }
                                                                                            
                                                                                            return (
                                                                                                <>
                                                                                                    <span className="font-medium text-gray-700 block mb-1">Tool Input (Complete):</span>
                                                                                                    <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto">
                                                                                                        {typeof entry.metadata.tool_input === 'string'
                                                                                                            ? entry.metadata.tool_input
                                                                                                            : JSON.stringify(entry.metadata.tool_input, null, 2)}
                                                                                                    </pre>
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {/* Other Metadata */}
                                                                        {Object.entries(entry.metadata)
                                                                            .filter(([key]) => !['agent', 'step', 'decision', 'reason', 'purpose', 'action', 'input_summary', 'tool_id', 'function_name', 'function_arguments', 'sql_query', 'python_code', 'tool_name', 'tool_input', 'tool_arguments', 'target_agent', 'query', 'query_preview', 'stop_reason'].includes(key))
                                                                            .length > 0 && (
                                                                                <div className="space-y-1.5">
                                                                                    <div className="font-semibold text-gray-700 text-xs uppercase tracking-wide border-b border-gray-300 pb-1">
                                                                                        Additional Metadata
                                                                                    </div>
                                                                                    {Object.entries(entry.metadata)
                                                                                        .filter(([key]) => !['agent', 'step', 'decision', 'reason', 'purpose', 'action', 'input_summary', 'tool_id', 'function_name', 'function_arguments', 'sql_query', 'python_code', 'tool_name', 'tool_input', 'tool_arguments', 'target_agent', 'query', 'query_preview', 'stop_reason'].includes(key))
                                                                                        .map(([key, value]) => (
                                                                                            <div key={key} className="pl-2">
                                                                                                <span className="font-medium text-gray-700">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                                                                                                <span className="text-gray-600 ml-1">
                                                                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                                                                </span>
                                                                                            </div>
                                                                                        ))}
                                                                                </div>
                                                                            )}
                                                                    </div>
                                                                </details>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Streaming message - Yellow while processing */}
                            {currentStreamingMessage && (
                                <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded">
                                    <div className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-semibold text-sm text-yellow-800">AI Agent</span>
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
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                                {currentStreamingMessage}
                                            </ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* Real-time Audit Trail */}
                                    {currentAuditTrail && currentAuditTrail.length > 0 && (
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
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${entry.type === 'thinking' ? 'bg-blue-100 text-blue-800' :
                                                                    entry.type === 'decision' ? 'bg-indigo-100 text-indigo-800' :
                                                                        entry.type === 'tool_call' ? 'bg-purple-100 text-purple-800' :
                                                                            entry.type === 'agent_routing' ? 'bg-orange-100 text-orange-800' :
                                                                                entry.type === 'validation' ? 'bg-yellow-100 text-yellow-800' :
                                                                                    'bg-gray-100 text-gray-800'
                                                                    }`}>
                                                                    {entry.type.replace('_', ' ').toUpperCase()}
                                                                </span>
                                                                {entry.metadata?.agent && (
                                                                    <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                                                                        {entry.metadata.agent}
                                                                    </span>
                                                                )}
                                                                {entry.metadata?.step && (
                                                                    <span className="text-xs text-gray-500">
                                                                        Step {entry.metadata.step}
                                                                    </span>
                                                                )}
                                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {formatTimestamp(entry.timestamp)}
                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-700 font-medium">
                                                            {entry.content}
                                                        </div>
                                                        {entry.metadata && Object.keys(entry.metadata).filter(k => k !== 'agent' && k !== 'step').length > 0 && (
                                                            <details className="mt-2">
                                                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center">
                                                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    View metadata
                                                                </summary>
                                                                <div className="text-xs bg-gray-50 p-2 rounded mt-1">
                                                                    {entry.metadata.tool_name && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700">Tool:</span>
                                                                            <code className="text-purple-700 ml-1 bg-purple-50 px-1 py-0.5 rounded text-xs">{entry.metadata.tool_name}</code>
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.purpose && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700">Purpose:</span>
                                                                            <span className="text-gray-600 ml-1">{entry.metadata.purpose}</span>
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.decision && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700">Decision:</span>
                                                                            <span className="text-gray-600 ml-1">{entry.metadata.decision}</span>
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.input_summary && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700 block mb-1">Input:</span>
                                                                            {entry.metadata.input_summary.toUpperCase().includes('SELECT') || 
                                                                             entry.metadata.input_summary.toUpperCase().includes('FROM') ? (
                                                                                <pre className="text-xs bg-slate-900 text-green-400 p-2 rounded border border-gray-300 overflow-x-auto font-mono">
                                                                                    {entry.metadata.input_summary}
                                                                                </pre>
                                                                            ) : (
                                                                                <span className="text-gray-600">{entry.metadata.input_summary}</span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.tool_input && (() => {
                                                                        const toolInput = typeof entry.metadata.tool_input === 'string' 
                                                                            ? JSON.parse(entry.metadata.tool_input) 
                                                                            : entry.metadata.tool_input;
                                                                        const sqlQuery = toolInput?.sql_query;
                                                                        
                                                                        if (sqlQuery) {
                                                                            return (
                                                                                <div className="mt-2">
                                                                                    <span className="font-medium text-gray-700 block mb-1">SQL Query:</span>
                                                                                    <pre className="text-xs bg-slate-900 text-green-400 p-2 rounded border border-gray-300 overflow-x-auto max-h-48 overflow-y-auto font-mono">
                                                                                        {sqlQuery}
                                                                                    </pre>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            </details>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isProcessing && !currentStreamingMessage && (
                                <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded">
                                    <div className="p-4">
                                        <div className="flex items-center mb-3">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-3"></div>
                                            <span className="text-sm text-gray-700 font-medium">Agent is processing your request...</span>
                                        </div>
                                    </div>

                                    {/* Show audit trail even before streaming starts */}
                                    {currentAuditTrail && currentAuditTrail.length > 0 && (
                                        <div className="border-t border-yellow-200 bg-yellow-100/50">
                                            <div className="px-4 py-2 flex items-center justify-between text-xs text-yellow-800">
                                                <span className="flex items-center font-medium">
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    Processing Steps ({currentAuditTrail.length} entries)
                                                </span>
                                                <span className="flex items-center text-yellow-600">
                                                    <div className="w-2 h-2 bg-yellow-600 rounded-full animate-pulse mr-1.5"></div>
                                                    Active
                                                </span>
                                            </div>

                                            <div className="px-4 pb-4 space-y-2 max-h-96 overflow-y-auto">
                                                {currentAuditTrail.map((entry, entryIndex) => (
                                                    <div key={entryIndex} className="bg-white rounded border border-yellow-200 p-3 animate-fadeIn">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${entry.type === 'thinking' ? 'bg-blue-100 text-blue-800' :
                                                                        entry.type === 'decision' ? 'bg-indigo-100 text-indigo-800' :
                                                                            entry.type === 'tool_call' ? 'bg-purple-100 text-purple-800' :
                                                                                entry.type === 'agent_routing' ? 'bg-orange-100 text-orange-800' :
                                                                                    entry.type === 'validation' ? 'bg-yellow-100 text-yellow-800' :
                                                                                        'bg-gray-100 text-gray-800'
                                                                    }`}>
                                                                    {entry.type.replace('_', ' ').toUpperCase()}
                                                                </span>
                                                                {entry.metadata?.agent && (
                                                                    <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                                                                        {entry.metadata.agent}
                                                                    </span>
                                                                )}
                                                                {entry.metadata?.step && (
                                                                    <span className="text-xs text-gray-500">
                                                                        Step {entry.metadata.step}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-500">
                                                                {formatTimestamp(entry.timestamp)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-700 font-medium">
                                                            {entry.content}
                                                        </div>
                                                        {entry.metadata && Object.keys(entry.metadata).filter(k => k !== 'agent' && k !== 'step').length > 0 && (
                                                            <details className="mt-2">
                                                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center">
                                                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    View metadata
                                                                </summary>
                                                                <div className="text-xs bg-gray-50 p-2 rounded mt-1">
                                                                    {entry.metadata.tool_name && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700">Tool:</span>
                                                                            <code className="text-purple-700 ml-1 bg-purple-50 px-1 py-0.5 rounded text-xs">{entry.metadata.tool_name}</code>
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.purpose && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700">Purpose:</span>
                                                                            <span className="text-gray-600 ml-1">{entry.metadata.purpose}</span>
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.decision && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700">Decision:</span>
                                                                            <span className="text-gray-600 ml-1">{entry.metadata.decision}</span>
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.input_summary && (
                                                                        <div className="mb-1">
                                                                            <span className="font-medium text-gray-700 block mb-1">Input:</span>
                                                                            {entry.metadata.input_summary.toUpperCase().includes('SELECT') || 
                                                                             entry.metadata.input_summary.toUpperCase().includes('FROM') ? (
                                                                                <pre className="text-xs bg-slate-900 text-green-400 p-2 rounded border border-gray-300 overflow-x-auto font-mono">
                                                                                    {entry.metadata.input_summary}
                                                                                </pre>
                                                                            ) : (
                                                                                <span className="text-gray-600">{entry.metadata.input_summary}</span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {entry.metadata.tool_input && (() => {
                                                                        const toolInput = typeof entry.metadata.tool_input === 'string' 
                                                                            ? JSON.parse(entry.metadata.tool_input) 
                                                                            : entry.metadata.tool_input;
                                                                        const sqlQuery = toolInput?.sql_query;
                                                                        
                                                                        if (sqlQuery) {
                                                                            return (
                                                                                <div className="mt-2">
                                                                                    <span className="font-medium text-gray-700 block mb-1">SQL Query:</span>
                                                                                    <pre className="text-xs bg-slate-900 text-green-400 p-2 rounded border border-gray-300 overflow-x-auto max-h-48 overflow-y-auto font-mono">
                                                                                        {sqlQuery}
                                                                                    </pre>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            </details>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Scroll anchor for agent responses */}
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
                                            <span className="text-xs text-gray-500">
                                                {formatTimestamp(message.timestamp)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-800">
                                            {message.content}
                                        </div>
                                    </div>
                                ))}

                                {/* Scroll anchor for user requests */}
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
                                    placeholder="Type your question or request here..."
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
        </div>
    );
}
