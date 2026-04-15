/**
 * Risk Analyst Messages Service for DynamoDB Message Persistence
 *
 * Handles saving and retrieving Risk Analyst conversation messages from DynamoDB
 * through the Risk Analyst API Lambda function.
 */

import { authService } from '../auth/authService';
import { MspMessage } from '../hooks/useMspChat';

export interface SaveMspMessageRequest {
    userId: string;
    messageId: string;
    role: 'user' | 'agent';
    content: string;
    timestamp?: string;
    auditTrail?: any[];
    images?: Array<{ base64: string; alt: string }>;
}

export interface GetMspMessagesResponse {
    userId: string;
    messages: MspMessage[];
    count: number;
    lastEvaluatedKey?: string;
}

class MspMessagesService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

        if (!this.baseUrl) {
            console.warn('API endpoint not configured. Risk Analyst message persistence disabled.');
        }
    }

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

    private async getUserId(): Promise<string> {
        try {
            const user = await authService.getCurrentUser();
            if (user) {
                return user.userId || user.email || 'anonymous';
            }

            const session = await authService.getSession();
            if (session.idToken) {
                const payload = JSON.parse(
                    atob(session.idToken.split('.')[1])
                );
                return payload.sub || payload.email || 'anonymous';
            }

            return 'anonymous';
        } catch (error) {
            console.error('Error getting user ID:', error);
            return 'anonymous';
        }
    }

    async getMessages(): Promise<GetMspMessagesResponse | null> {
        if (!this.baseUrl) {
            console.warn('API endpoint not configured, skipping Risk Analyst message retrieval');
            return null;
        }

        try {
            const userId = await this.getUserId();
            const headers = await this.getAuthHeaders();

            const response = await fetch(
                `${this.baseUrl}/msp-conversations/${encodeURIComponent(userId)}?fetchAll=true`,
                {
                    method: 'GET',
                    headers,
                }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        userId,
                        messages: [],
                        count: 0,
                    };
                }
                throw new Error(`Failed to get Risk Analyst messages: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error getting Risk Analyst messages:', error);
            throw error;
        }
    }

    async saveMessage(message: SaveMspMessageRequest): Promise<boolean> {
        if (!this.baseUrl) {
            console.warn('API endpoint not configured, skipping Risk Analyst message save');
            return false;
        }

        try {
            const headers = await this.getAuthHeaders();

            const response = await fetch(`${this.baseUrl}/msp-conversations`, {
                method: 'POST',
                headers,
                body: JSON.stringify(message),
            });

            if (!response.ok) {
                throw new Error(`Failed to save Risk Analyst message: ${response.status} ${response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Error saving Risk Analyst message:', error);
            throw error;
        }
    }

    async saveUserMessage(
        messageId: string,
        content: string,
        timestamp?: string
    ): Promise<boolean> {
        const userId = await this.getUserId();

        return this.saveMessage({
            userId,
            messageId,
            role: 'user',
            content,
            timestamp: timestamp || new Date().toISOString(),
        });
    }

    async saveAgentMessage(
        messageId: string,
        content: string,
        auditTrail: any[],
        timestamp?: string,
        images?: Array<{ base64: string; alt: string }>
    ): Promise<boolean> {
        const userId = await this.getUserId();

        return this.saveMessage({
            userId,
            messageId,
            role: 'agent',
            content,
            auditTrail,
            timestamp: timestamp || new Date().toISOString(),
            images,
        });
    }
}

export const mspMessagesService = new MspMessagesService();
