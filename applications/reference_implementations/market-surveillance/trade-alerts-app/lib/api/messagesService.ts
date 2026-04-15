/**
 * Messages Service for DynamoDB Message Persistence
 * 
 * Handles saving and retrieving conversation messages from DynamoDB
 * through the Alert API Lambda function.
 */

import { authService } from '../auth/authService';
import { AgentMessageWithAudit } from '../hooks/useAgentChat';

export interface SaveMessageRequest {
    alertId: string;
    userId: string;
    messageId: string;
    role: 'user' | 'agent';
    content: string;
    timestamp?: string;
    auditTrail?: any[];
}

export interface GetMessagesResponse {
    alertId: string;
    userId: string;
    messages: AgentMessageWithAudit[];
    count: number;
    lastEvaluatedKey?: string;
}

class MessagesService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

        if (!this.baseUrl) {
            console.warn('⚠️  API endpoint not configured. Message persistence disabled.');
        }
    }

    /**
     * Get authentication headers
     */
    private async getAuthHeaders(): Promise<HeadersInit> {
        const session = await authService.getSession();

        if (!session.idToken) {
            throw new Error('No authentication token available');
        }

        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.idToken}`,
        };
    }

    /**
     * Get user ID from current session
     */
    private async getUserId(): Promise<string> {
        try {
            // Try to get current user first
            const user = await authService.getCurrentUser();
            if (user) {
                // Prioritize userId (sub) over email
                return user.userId || user.email || 'anonymous';
            }

            // Fallback: decode ID token to get user info
            const session = await authService.getSession();
            if (session.idToken) {
                // Decode JWT token (simple base64 decode of payload)
                const payload = JSON.parse(
                    atob(session.idToken.split('.')[1])
                );
                // Prioritize sub (user ID) over email
                return payload.sub || payload.email || 'anonymous';
            }

            return 'anonymous';
        } catch (error) {
            console.error('Error getting user ID:', error);
            return 'anonymous';
        }
    }

    /**
     * Get all messages for a user's alert conversation
     */
    async getMessages(alertId: string, limit: number = 100): Promise<GetMessagesResponse | null> {
        if (!this.baseUrl) {
            console.warn('API endpoint not configured, skipping message retrieval');
            return null;
        }

        try {
            const userId = await this.getUserId();
            const headers = await this.getAuthHeaders();

            const response = await fetch(
                `${this.baseUrl}/conversations/${alertId}/${encodeURIComponent(userId)}?fetchAll=true`,
                {
                    method: 'GET',
                    headers,
                }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    // No messages found yet, return empty
                    return {
                        alertId,
                        userId,
                        messages: [],
                        count: 0,
                    };
                }
                throw new Error(`Failed to get messages: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error getting messages:', error);
            throw error;
        }
    }

    /**
     * Save a message to DynamoDB
     */
    async saveMessage(message: SaveMessageRequest): Promise<boolean> {
        if (!this.baseUrl) {
            console.warn('API endpoint not configured, skipping message save');
            return false;
        }

        try {
            const headers = await this.getAuthHeaders();

            const response = await fetch(`${this.baseUrl}/conversations`, {
                method: 'POST',
                headers,
                body: JSON.stringify(message),
            });

            if (!response.ok) {
                throw new Error(`Failed to save message: ${response.status} ${response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Error saving message:', error);
            throw error;
        }
    }

    /**
     * Save a user message
     */
    async saveUserMessage(
        alertId: string,
        messageId: string,
        content: string,
        timestamp?: string
    ): Promise<boolean> {
        const userId = await this.getUserId();

        return this.saveMessage({
            alertId,
            userId,
            messageId,
            role: 'user',
            content,
            timestamp: timestamp || new Date().toISOString(),
        });
    }

    /**
     * Save an agent message with audit trail
     */
    async saveAgentMessage(
        alertId: string,
        messageId: string,
        content: string,
        auditTrail: any[],
        timestamp?: string
    ): Promise<boolean> {
        const userId = await this.getUserId();

        return this.saveMessage({
            alertId,
            userId,
            messageId,
            role: 'agent',
            content,
            auditTrail,
            timestamp: timestamp || new Date().toISOString(),
        });
    }
}

// Export singleton instance
export const messagesService = new MessagesService();
