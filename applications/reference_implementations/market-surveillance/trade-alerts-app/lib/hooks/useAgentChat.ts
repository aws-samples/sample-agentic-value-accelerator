/**
 * Custom React Hook for Agent Chat
 * 
 * Manages agent chat state, streaming responses, and conversation history
 * Integrates with DynamoDB for message persistence
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { agentService, AgentMessage, AgentStreamChunk } from '../api/agentService';
import { messagesService } from '../api/messagesService';
import { v4 as uuidv4 } from 'uuid';

export interface AuditTrailEntry {
    timestamp: string;
    type: 'thinking' | 'trace' | 'tool_call' | 'agent_routing' | 'decision' | 'validation';
    content: string;
    metadata?: Record<string, any>;
}

export interface AgentMessageWithAudit extends AgentMessage {
    auditTrail?: AuditTrailEntry[];
}

export interface UseAgentChatOptions {
    alertId: string;
    sessionId?: string;
    enabled?: boolean; // Control whether to load history and enable functionality
}

export interface UseAgentChatReturn {
    messages: AgentMessageWithAudit[];
    isProcessing: boolean;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    currentStreamingMessage: string;
    currentAuditTrail: AuditTrailEntry[];
    isLoadingHistory: boolean;
}

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatReturn {
    const { alertId, sessionId: initialSessionId, enabled = true } = options;

    const [messages, setMessages] = useState<AgentMessageWithAudit[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
    const [currentAuditTrail, setCurrentAuditTrail] = useState<AuditTrailEntry[]>([]);

    const sessionIdRef = useRef(initialSessionId || `alert-${alertId}-${Date.now()}`);
    const streamingMessageRef = useRef('');
    const auditTrailRef = useRef<AuditTrailEntry[]>([]);
    const seenEventsRef = useRef<Set<string>>(new Set());

    /**
     * Load conversation history from DynamoDB on mount
     */
    useEffect(() => {
        // Only load history if enabled
        if (!enabled) {
            setIsLoadingHistory(false);
            return;
        }

        const loadHistory = async () => {
            try {
                setIsLoadingHistory(true);
                const response = await messagesService.getMessages(alertId);

                if (response && response.messages.length > 0) {
                    setMessages(response.messages);
                    console.log(`Loaded ${response.messages.length} messages from history`);
                }
            } catch (err) {
                console.error('Failed to load message history:', err);
                // Don't set error state - just log it and continue with empty history
            } finally {
                setIsLoadingHistory(false);
            }
        };

        loadHistory();
    }, [alertId, enabled]);

    /**
     * Generate a unique key for an audit event to detect duplicates
     */
    const generateEventKey = (entry: AuditTrailEntry): string => {
        const agent = entry.metadata?.agent || 'unknown';
        const type = entry.type;
        const toolName = entry.metadata?.tool_name || '';
        const targetAgent = entry.metadata?.target_agent || '';
        const content = entry.content;

        // Create a unique key based on agent, type, and key metadata
        return `${agent}:${type}:${toolName}:${targetAgent}:${content}`;
    };

    /**
     * Handle streaming chunk from agent
     */
    const handleChunk = useCallback((chunk: AgentStreamChunk) => {
        if (chunk.type === 'text') {
            // Append to streaming message
            streamingMessageRef.current += chunk.data;
            setCurrentStreamingMessage(streamingMessageRef.current);
        } else if (chunk.type === 'trace' || chunk.type === 'thinking') {
            // Capture trace/thinking information for audit trail
            // chunk.data can be a string or structured object
            let eventData = chunk.data;
            let auditEntry: AuditTrailEntry;

            if (typeof eventData === 'string') {
                // Legacy string format
                auditEntry = {
                    timestamp: new Date().toISOString(),
                    type: chunk.type,
                    content: eventData,
                };
            } else if (typeof eventData === 'object' && eventData !== null) {
                // Structured format with agent, type, message, metadata
                const structuredData = eventData as any; // Type assertion for structured event data
                auditEntry = {
                    timestamp: new Date().toISOString(),
                    type: structuredData.type || chunk.type,
                    content: structuredData.message || JSON.stringify(eventData),
                    metadata: {
                        agent: structuredData.agent,
                        ...structuredData.metadata
                    }
                };
            } else {
                // Fallback
                auditEntry = {
                    timestamp: new Date().toISOString(),
                    type: chunk.type,
                    content: String(eventData),
                };
            }

            // Deduplicate events - only add if we haven't seen this exact event before
            const eventKey = generateEventKey(auditEntry);
            if (!seenEventsRef.current.has(eventKey)) {
                seenEventsRef.current.add(eventKey);
                auditTrailRef.current.push(auditEntry);
                setCurrentAuditTrail([...auditTrailRef.current]);
                console.log('Agent audit entry:', auditEntry);
            }
        }
    }, []);

    /**
     * Handle stream completion
     */
    const handleComplete = useCallback(async () => {
        // Add the complete agent message to the conversation with audit trail
        if (streamingMessageRef.current) {
            const messageId = uuidv4();
            const timestamp = new Date().toISOString();

            const agentMessage: AgentMessageWithAudit = {
                role: 'agent',
                content: streamingMessageRef.current,
                timestamp,
                auditTrail: [...auditTrailRef.current]
            };

            setMessages(prev => [...prev, agentMessage]);

            // Save agent message to DynamoDB
            try {
                await messagesService.saveAgentMessage(
                    alertId,
                    messageId,
                    streamingMessageRef.current,
                    auditTrailRef.current,
                    timestamp
                );
                console.log('Agent message saved to DynamoDB');
            } catch (err) {
                console.error('Failed to save agent message:', err);
                // Don't fail the UI - message is still shown locally
            }
        }

        // Reset streaming state
        streamingMessageRef.current = '';
        setCurrentStreamingMessage('');
        auditTrailRef.current = [];
        setCurrentAuditTrail([]);
        seenEventsRef.current.clear();
        setIsProcessing(false);
    }, [alertId]);

    /**
     * Handle stream error
     */
    const handleError = useCallback((err: Error) => {
        console.error('Agent stream error:', err);
        setError(err.message);
        setIsProcessing(false);

        // Reset streaming state
        streamingMessageRef.current = '';
        setCurrentStreamingMessage('');
        auditTrailRef.current = [];
        setCurrentAuditTrail([]);
        seenEventsRef.current.clear();
    }, []);

    /**
     * Send a message to the agent
     */
    const sendMessage = useCallback(async (message: string) => {
        if (!message.trim() || isProcessing) {
            return;
        }

        setError(null);
        setIsProcessing(true);

        // Reset streaming message and audit trail
        streamingMessageRef.current = '';
        setCurrentStreamingMessage('');
        auditTrailRef.current = [];
        setCurrentAuditTrail([]);
        seenEventsRef.current.clear();

        // Add user message to conversation
        const messageId = uuidv4();
        const timestamp = new Date().toISOString();

        const userMessage: AgentMessageWithAudit = {
            role: 'user',
            content: message,
            timestamp
        };

        setMessages(prev => [...prev, userMessage]);

        // Save user message to DynamoDB
        try {
            await messagesService.saveUserMessage(alertId, messageId, message, timestamp);
            console.log('User message saved to DynamoDB');
        } catch (err) {
            console.error('Failed to save user message:', err);
            // Don't fail the UI - continue with agent call
        }

        try {
            // Send message to agent with streaming
            await agentService.sendMessage({
                alertId,
                message,
                sessionId: sessionIdRef.current,
                onChunk: handleChunk,
                onComplete: handleComplete,
                onError: handleError
            });
        } catch (err) {
            handleError(err as Error);
        }
    }, [alertId, isProcessing, handleChunk, handleComplete, handleError]);

    return {
        messages,
        isProcessing,
        error,
        sendMessage,
        currentStreamingMessage,
        currentAuditTrail,
        isLoadingHistory
    };
}
