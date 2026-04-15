/**
 * Agent Service for AgentCore Runtime Integration
 * 
 * This service handles communication with the AgentCore Runtime API
 * through a Next.js API route that manages authentication and CORS.
 */

import { authService } from '../auth/authService';

export interface AgentMessage {
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: string;
}

export interface AgentStreamChunk {
    type: 'text' | 'trace' | 'thinking' | 'error' | 'complete';
    data: string;
}

export interface SendMessageOptions {
    alertId: string;
    message: string;
    sessionId?: string;
    onChunk?: (chunk: AgentStreamChunk) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}

class AgentService {
    /**
     * Get authentication headers for API requests
     */
    private async getAuthHeaders(): Promise<HeadersInit> {
        const session = await authService.getSession();

        // Use ID token (not access token) for AgentCore Runtime authentication
        // ID token has aud claim set to client ID, which AgentCore validates
        if (!session.idToken) {
            throw new Error('No authentication token available');
        }

        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.idToken}`,
        };
    }

    /**
     * Send a message to the agent with streaming response
     */
    async sendMessage(options: SendMessageOptions): Promise<void> {
        const { alertId, message, sessionId, onChunk, onComplete, onError } = options;

        try {
            const headers = await this.getAuthHeaders();
            
            // Get user ID from ID token (sub claim contains the Cognito user ID)
            let userId = 'anonymous';
            try {
                const userAttributes = await authService.getUserAttributes();
                // sub is the unique Cognito user ID (UUID)
                userId = userAttributes?.sub || 'anonymous';
            } catch (err) {
                console.warn('Failed to get user ID, using anonymous:', err);
            }

            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message,
                    sessionId: sessionId || `alert-${alertId}-${Date.now()}`,
                    alertId,
                    userId, // Include user ID in request body
                }),
            });

            if (!response.ok) {
                throw new Error(`Agent API error: ${response.status} ${response.statusText}`);
            }

            // Handle streaming response
            await this.handleStreamingResponse(response, onChunk, onComplete, onError);

        } catch (error) {
            console.error('Agent service error:', error);
            if (onError) {
                onError(error as Error);
            }
            throw error;
        }
    }

    /**
     * Handle streaming response from API route
     */
    private async handleStreamingResponse(
        response: Response,
        onChunk?: (chunk: AgentStreamChunk) => void,
        onComplete?: () => void,
        onError?: (error: Error) => void
    ): Promise<void> {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('Response body is not readable');
        }

        // Optional: Activity timeout to detect stuck streams
        // Set to 10 minutes - if no data received for this long, assume connection is dead
        // This is a safety net; normal operations should complete or emit events regularly
        let lastActivityTime = Date.now();
        const ACTIVITY_TIMEOUT = 600000; // 10 minutes of inactivity before timeout
        const ENABLE_ACTIVITY_TIMEOUT = true; // Set to false to disable and rely on infrastructure timeouts

        let activityMonitor: NodeJS.Timeout | null = null;
        
        if (ENABLE_ACTIVITY_TIMEOUT) {
            // Monitor for inactivity
            activityMonitor = setInterval(() => {
                const timeSinceLastActivity = Date.now() - lastActivityTime;
                if (timeSinceLastActivity > ACTIVITY_TIMEOUT) {
                    if (activityMonitor) clearInterval(activityMonitor);
                    reader.cancel();
                    if (onError) {
                        onError(new Error(`Stream timeout: No data received for ${ACTIVITY_TIMEOUT / 60000} minutes`));
                    }
                }
            }, 10000); // Check every 10 seconds
        }

        try {
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    if (activityMonitor) clearInterval(activityMonitor);
                    if (onComplete) {
                        onComplete();
                    }
                    break;
                }

                // Update activity timestamp
                lastActivityTime = Date.now();

                // Decode the chunk
                buffer += decoder.decode(value, { stream: true });

                // Process complete events (separated by newlines)
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const event = JSON.parse(line);

                        // Process different event types
                        if (event.type && onChunk) {
                            onChunk({
                                type: event.type,
                                data: event.data || '',
                            });
                        }

                        // Handle errors
                        if (event.type === 'error' && onError) {
                            onError(new Error(event.data || 'Agent error'));
                        }
                    } catch (parseError) {
                        console.error('Error parsing stream chunk:', parseError);
                    }
                }
            }
        } catch (error) {
            if (activityMonitor) clearInterval(activityMonitor);
            console.error('Stream reading error:', error);
            if (onError) {
                onError(error as Error);
            }
        } finally {
            if (activityMonitor) clearInterval(activityMonitor);
            reader.releaseLock();
        }
    }

}

// Export singleton instance
export const agentService = new AgentService();
