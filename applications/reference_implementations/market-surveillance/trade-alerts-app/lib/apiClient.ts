/**
 * API Client for Trade Alerts Application
 * 
 * This client handles all API requests to the backend services through API Gateway.
 * It automatically includes Cognito authentication tokens and provides error handling.
 */

import { authService } from './auth/authService';
import { Alert, Investigation } from '@/types/alert';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    statusCode?: number;
}

export interface ApiError {
    message: string;
    statusCode?: number;
    code?: string;
}

class ApiClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

        if (!this.baseUrl) {
            console.error(
                '❌ API endpoint not configured!',
                'Set NEXT_PUBLIC_API_ENDPOINT in .env.local to connect to backend.'
            );
        } else {
            console.log('API Client initialized with endpoint:', this.baseUrl);
        }
    }

    /**
     * Get authentication headers with Cognito token
     */
    private async getAuthHeaders(): Promise<HeadersInit> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        try {
            const session = await authService.getSession();
            
            if (session.idToken) {
                headers['Authorization'] = `Bearer ${session.idToken}`;
            } else if (session.error) {
                console.warn('Failed to get auth token:', session.error);
            }
        } catch (error) {
            console.error('Error getting auth headers:', error);
        }

        return headers;
    }

    /**
     * Make an authenticated API request
     */
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<ApiResponse<T>> {
        // Check if API endpoint is configured
        if (!this.baseUrl) {
            return {
                success: false,
                error: 'API endpoint not configured. Please set NEXT_PUBLIC_API_ENDPOINT in .env.local',
                statusCode: 500,
            };
        }

        try {
            const headers = await this.getAuthHeaders();
            const url = `${this.baseUrl}${endpoint}`;

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers,
                },
            });

            // Handle authentication errors
            if (response.status === 401 || response.status === 403) {
                return {
                    success: false,
                    error: 'Authentication required. Please sign in.',
                    statusCode: response.status,
                };
            }

            // Handle other HTTP errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: errorData.error || errorData.message || `Request failed with status ${response.status}`,
                    statusCode: response.status,
                };
            }

            const data = await response.json();
            return {
                success: true,
                data,
                statusCode: response.status,
            };
        } catch (error: any) {
            console.error('API request failed:', error);
            return {
                success: false,
                error: error.message || 'Network error. Please check your connection.',
            };
        }
    }

    /**
     * Get all alerts
     */
    async getAlerts(): Promise<ApiResponse<Alert[]>> {
        return this.request<Alert[]>('/alerts');
    }

    /**
     * Get a single alert by ID
     */
    async getAlert(alertId: string): Promise<ApiResponse<Alert>> {
        return this.request<Alert>(`/alerts/${alertId}`);
    }

    /**
     * Get investigation for an alert
     */
    async getInvestigation(alertId: string): Promise<ApiResponse<Investigation>> {
        return this.request<Investigation>(`/investigations/${alertId}`);
    }

    /**
     * Update alert status
     */
    async updateAlertStatus(
        alertId: string,
        status: 'pending' | 'investigating' | 'resolved'
    ): Promise<ApiResponse<Alert>> {
        return this.request<Alert>(`/alerts/${alertId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
        });
    }

    /**
     * Create a new investigation step
     */
    async addInvestigationStep(
        alertId: string,
        action: string,
        findings: string,
        agent: string
    ): Promise<ApiResponse<Investigation>> {
        return this.request<Investigation>(`/investigations/${alertId}/steps`, {
            method: 'POST',
            body: JSON.stringify({ action, findings, agent }),
        });
    }

    /**
     * Check if API endpoint is configured
     */
    isConfigured(): boolean {
        return !!this.baseUrl;
    }

    /**
     * Get the configured API endpoint
     */
    getEndpoint(): string {
        return this.baseUrl;
    }
}

// Export singleton instance
export const apiClient = new ApiClient();
