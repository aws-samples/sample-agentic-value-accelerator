/**
 * Summaries Service
 * 
 * Handles API calls for alert investigation summaries
 */

import { authService } from '../auth/authService';

export interface SummaryData {
    PK: string;
    SK: string;
    alertId: string;
    summaryText: string;
    findings: string[];
    recommendations: string[];
    generatedAt: string;
    version: number;
    generatedBy?: string;
    status?: string;
    investigationId?: string;
    triggeredAt?: string;
    triggeredByUser?: string;
    completedAt?: string;
    errorMessage?: string;
    asyncAuditTrail?: Array<{
        timestamp: string;
        type: string;
        content: string;
        metadata?: Record<string, any>;
    }>;
    ttl?: number;
}

export interface GetSummaryResponse {
    alertId: string;
    summary: SummaryData | null;
    summaries?: SummaryData[];
    count?: number;
}

class SummariesService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

        if (!this.baseUrl) {
            console.warn('⚠️  API endpoint not configured. Summary retrieval disabled.');
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
     * Get the latest investigation summary for an alert
     */
    async getLatestSummary(alertId: string): Promise<GetSummaryResponse | null> {
        if (!this.baseUrl) {
            console.warn('API endpoint not configured');
            return null;
        }

        try {
            const headers = await this.getAuthHeaders();

            const response = await fetch(
                `${this.baseUrl}/summaries/${alertId}`,
                {
                    method: 'GET',
                    headers,
                }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    // No summary found - return null
                    return {
                        alertId,
                        summary: null
                    };
                }
                throw new Error(`Failed to fetch summary: ${response.statusText}`);
            }

            const data: GetSummaryResponse = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching summary:', error);
            throw error;
        }
    }

    /**
     * Save a new investigation summary
     */
    async saveSummary(
        alertId: string,
        summaryText: string,
        findings: string[],
        recommendations: string[],
        asyncAuditTrail?: Array<{
            timestamp: string;
            type: string;
            content: string;
            metadata?: Record<string, any>;
        }>,
        generatedBy: string = 'async-agent',
        version: number = 1
    ): Promise<{ message: string; alertId: string; timestamp: string }> {
        if (!this.baseUrl) {
            throw new Error('API endpoint not configured');
        }

        try {
            const headers = await this.getAuthHeaders();

            const response = await fetch(
                `${this.baseUrl}/summaries`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        alertId,
                        summaryText,
                        findings,
                        recommendations,
                        asyncAuditTrail: asyncAuditTrail || [],
                        generatedBy,
                        version
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to save summary: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error saving summary:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const summariesService = new SummariesService();
