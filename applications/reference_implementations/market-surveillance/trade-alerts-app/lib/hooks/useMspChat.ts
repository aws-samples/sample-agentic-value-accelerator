/**
 * Custom React Hook for Risk Analyst Agent Chat
 *
 * Manages Risk Analyst chat state, streaming responses, and conversation.
 * Follows the same pattern as useAgentChat but targets the Risk Analyst API route.
 * Integrates with DynamoDB for message persistence.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { authService } from '../auth/authService';
import { mspMessagesService } from '../api/mspMessagesService';
import { v4 as uuidv4 } from 'uuid';

export interface MspAuditTrailEntry {
    timestamp: string;
    type: 'thinking' | 'trace' | 'tool_call' | 'agent_routing' | 'decision' | 'validation';
    content: string;
    metadata?: Record<string, any>;
}

export interface MspChartImage {
    base64: string;
    alt: string;
}

export interface MspMessage {
    role: 'user' | 'agent';
    content: string;
    timestamp: string;
    auditTrail?: MspAuditTrailEntry[];
    images?: MspChartImage[];
}

export interface UseMspChatOptions {
    enabled?: boolean;
}

export interface UseMspChatReturn {
    messages: MspMessage[];
    isProcessing: boolean;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    currentStreamingMessage: string;
    currentAuditTrail: MspAuditTrailEntry[];
    currentStreamingImages: MspChartImage[];
    isLoadingHistory: boolean;
}

export function useMspChat(options: UseMspChatOptions = {}): UseMspChatReturn {
    const { enabled = true } = options;

    const [messages, setMessages] = useState<MspMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
    const [currentAuditTrail, setCurrentAuditTrail] = useState<MspAuditTrailEntry[]>([]);
    const [currentStreamingImages, setCurrentStreamingImages] = useState<MspChartImage[]>([]);

    const sessionIdRef = useRef(`msp-${Date.now()}`);
    const streamingMessageRef = useRef('');
    const auditTrailRef = useRef<MspAuditTrailEntry[]>([]);
    const imagesRef = useRef<MspChartImage[]>([]);
    const seenEventsRef = useRef<Set<string>>(new Set());

    /**
     * Load conversation history from DynamoDB on mount
     */
    useEffect(() => {
        if (!enabled) {
            setIsLoadingHistory(false);
            return;
        }

        const loadHistory = async () => {
            try {
                setIsLoadingHistory(true);
                const response = await mspMessagesService.getMessages();

                if (response && response.messages.length > 0) {
                    setMessages(response.messages);
                    console.log(`Loaded ${response.messages.length} Risk Analyst messages from history`);
                }
            } catch (err) {
                console.error('Failed to load Risk Analyst message history:', err);
            } finally {
                setIsLoadingHistory(false);
            }
        };

        loadHistory();
    }, [enabled]);

    const generateEventKey = (entry: MspAuditTrailEntry): string => {
        const agent = entry.metadata?.agent || 'unknown';
        const toolName = entry.metadata?.tool_name || '';
        const targetAgent = entry.metadata?.target_agent || '';
        return `${agent}:${entry.type}:${toolName}:${targetAgent}:${entry.content}`;
    };

    const sendMessage = useCallback(async (message: string) => {
        if (!message.trim() || isProcessing || !enabled) return;

        setError(null);
        setIsProcessing(true);
        streamingMessageRef.current = '';
        setCurrentStreamingMessage('');
        auditTrailRef.current = [];
        setCurrentAuditTrail([]);
        imagesRef.current = [];
        setCurrentStreamingImages([]);
        seenEventsRef.current.clear();

        const timestamp = new Date().toISOString();
        const userMessage: MspMessage = {
            role: 'user',
            content: message,
            timestamp,
        };
        setMessages(prev => [...prev, userMessage]);

        // Persist user message to DynamoDB
        const userMessageId = uuidv4();
        try {
            await mspMessagesService.saveUserMessage(userMessageId, message, timestamp);
        } catch (err) {
            console.error('Failed to save user message:', err);
        }

        try {
            const session = await authService.getSession();
            if (!session.idToken) throw new Error('No authentication token available');

            let userId = 'anonymous';
            try {
                const userAttributes = await authService.getUserAttributes();
                userId = userAttributes?.sub || 'anonymous';
            } catch { /* use anonymous */ }

            const response = await fetch('/api/msp/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.idToken}`,
                },
                body: JSON.stringify({
                    message,
                    sessionId: sessionIdRef.current,
                    userId,
                }),
            });

            if (!response.ok) {
                throw new Error(`Agent API error: ${response.status} ${response.statusText}`);
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('Response body is not readable');

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);
                        if (event.type === 'text') {
                            streamingMessageRef.current += event.data;
                            setCurrentStreamingMessage(streamingMessageRef.current);
                        } else if (event.type === 'trace' || event.type === 'thinking') {
                            const eventData = event.data;
                            let auditEntry: MspAuditTrailEntry;

                            if (typeof eventData === 'string') {
                                auditEntry = { timestamp: new Date().toISOString(), type: event.type, content: eventData };
                            } else if (typeof eventData === 'object' && eventData !== null) {
                                auditEntry = {
                                    timestamp: new Date().toISOString(),
                                    type: eventData.type || event.type,
                                    content: eventData.message || JSON.stringify(eventData),
                                    metadata: { agent: eventData.agent, ...eventData.metadata },
                                };
                            } else {
                                auditEntry = { timestamp: new Date().toISOString(), type: event.type, content: String(eventData) };
                            }

                            const eventKey = generateEventKey(auditEntry);
                            if (!seenEventsRef.current.has(eventKey)) {
                                seenEventsRef.current.add(eventKey);
                                auditTrailRef.current.push(auditEntry);
                                setCurrentAuditTrail([...auditTrailRef.current]);
                            }
                        } else if (event.type === 'image' && event.base64) {
                            const img: MspChartImage = { base64: event.base64, alt: event.alt || 'Chart' };
                            imagesRef.current = [...imagesRef.current, img];
                            setCurrentStreamingImages([...imagesRef.current]);
                        } else if (event.type === 'error') {
                            setError(event.data || 'Agent error');
                        }
                    } catch { /* skip unparseable lines */ }
                }
            }

            reader.releaseLock();

            // Finalize agent message
            if (streamingMessageRef.current || imagesRef.current.length > 0) {
                const agentTimestamp = new Date().toISOString();
                const agentMessage: MspMessage = {
                    role: 'agent',
                    content: streamingMessageRef.current,
                    timestamp: agentTimestamp,
                    auditTrail: [...auditTrailRef.current],
                    images: imagesRef.current.length > 0 ? [...imagesRef.current] : undefined,
                };
                setMessages(prev => [...prev, agentMessage]);

                // Persist agent message to DynamoDB
                const agentMessageId = uuidv4();
                try {
                    await mspMessagesService.saveAgentMessage(
                        agentMessageId,
                        streamingMessageRef.current,
                        [...auditTrailRef.current],
                        agentTimestamp,
                        imagesRef.current.length > 0 ? [...imagesRef.current] : undefined
                    );
                } catch (err) {
                    console.error('Failed to save agent message:', err);
                }
            }
        } catch (err) {
            console.error('Risk Analyst chat error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            streamingMessageRef.current = '';
            setCurrentStreamingMessage('');
            auditTrailRef.current = [];
            setCurrentAuditTrail([]);
            imagesRef.current = [];
            setCurrentStreamingImages([]);
            seenEventsRef.current.clear();
            setIsProcessing(false);
        }
    }, [isProcessing, enabled]);

    return {
        messages,
        isProcessing,
        error,
        sendMessage,
        currentStreamingMessage,
        currentAuditTrail,
        currentStreamingImages,
        isLoadingHistory,
    };
}
