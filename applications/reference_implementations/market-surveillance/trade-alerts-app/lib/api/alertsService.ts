/**
 * Alerts Service - Alert Data and Investigation API Integration
 * 
 * This service handles all alert-related API calls including:
 * - Alert data queries (alerts, accounts, products, trades) from RDS API
 * - Alert investigation triggers (async investigation API)
 */

import { authService } from '../auth/authService';
import { Alert, AlertApiResponse, mapAlertFromApi } from '../../types/alert';

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

export interface AlertFilters {
    status?: string;
    isin?: string;
    accountNumber?: string;
    accountName?: string;
    alertId?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: 'date' | 'alertAge';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}

export interface AlertsResponse {
    alerts: Alert[];
    total: number;
    limit: number;
    offset: number;
}

interface AlertsApiResponse {
    alerts: AlertApiResponse[];
    total: number;
    limit: number;
    offset: number;
}

// Investigation API Types
export interface TriggerInvestigationRequest {
    alertId?: string;
    alertIds?: string[];
    triggeredBy?: 'api' | 'scheduled' | 'manual';
    triggeredByUser?: string;
}

export interface TriggerInvestigationResponse {
    success: boolean;
    alertId?: string;
    alertIds?: string[];
    investigationId?: string;
    investigationIds?: string[];
    status: string;
    message: string;
    timestamp: string;
    results?: Array<{
        alertId: string;
        investigationId: string;
        status: string;
        message: string;
    }>;
}

/**
 * Get authentication headers with Cognito token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    try {
        const session = await authService.getSession();

        if (session.idToken) {
            headers['Authorization'] = `Bearer ${session.idToken}`;
        }
    } catch (error) {
        console.error('Error getting auth headers:', error);
    }

    return headers;
}

/**
 * Get current user ID for audit trail
 */
async function getUserId(): Promise<string> {
    try {
        const userAttributes = await authService.getUserAttributes();
        return userAttributes?.email || userAttributes?.sub || 'anonymous';
    } catch (err) {
        console.warn('Failed to get user ID:', err);
        return 'anonymous';
    }
}

/**
 * Get all alerts with optional filtering
 */
export async function getAlerts(filters?: AlertFilters): Promise<AlertsResponse> {
    try {
        const params = new URLSearchParams();

        if (filters?.status) params.append('status', filters.status);
        if (filters?.isin) params.append('isin', filters.isin);
        if (filters?.accountNumber) params.append('accountNumber', filters.accountNumber);
        if (filters?.accountName) params.append('accountName', filters.accountName);
        if (filters?.alertId) params.append('alertId', filters.alertId);
        if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
        if (filters?.dateTo) params.append('dateTo', filters.dateTo);
        if (filters?.sortBy) params.append('sortBy', filters.sortBy);
        if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());

        const headers = await getAuthHeaders();
        const response = await fetch(`${API_ENDPOINT}/alerts?${params}`, {
            headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: AlertsApiResponse = await response.json();

        // Map API response to frontend format
        return {
            alerts: data.alerts.map(mapAlertFromApi),
            total: data.total,
            limit: data.limit,
            offset: data.offset
        };
    } catch (error: any) {
        console.error('Error in getAlerts:', error);
        throw new Error(error.message || 'Failed to fetch alerts');
    }
}

/**
 * Get detailed alert information
 */
export async function getAlertDetails(alertId: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_ENDPOINT}/alerts/${alertId}`, {
            headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Map the alert data if it exists
        if (data.alert) {
            return {
                ...data,
                alert: mapAlertFromApi(data.alert)
            };
        }

        return data;
    } catch (error: any) {
        console.error('Error in getAlertDetails:', error);
        throw new Error(error.message || 'Failed to fetch alert details');
    }
}

/**
 * Get account details for an alert
 */
export async function getAlertAccount(alertId: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_ENDPOINT}/alerts/${alertId}/account`, {
            headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Map snake_case to PascalCase
        if (data.account) {
            return {
                account: {
                    Account_ID: data.account.account_id,
                    Account_Number: data.account.account_number,
                    Account_Name: data.account.account_name,
                    Account_Type: data.account.account_type,
                    Account_Sub_Type: data.account.account_sub_type,
                    FRB_Code: data.account.frb_code,
                    MLI_Number: data.account.mli_number,
                    Account_Country: data.account.account_country
                }
            };
        }
        
        return data;
    } catch (error: any) {
        console.error('Error in getAlertAccount:', error);
        throw new Error(error.message || 'Failed to fetch account details');
    }
}

/**
 * Get product details for an alert
 */
export async function getAlertProduct(alertId: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_ENDPOINT}/alerts/${alertId}/product`, {
            headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Map snake_case to PascalCase
        if (data.product) {
            return {
                product: {
                    ISIN: data.product.isin,
                    CUSIP: data.product.cusip,
                    BBGID: data.product.bbgid,
                    Product_Description: data.product.product_description,
                    Country_of_issue: data.product.country_of_issue,
                    Currency_of_issue: data.product.currency_of_issue,
                    Issue_Date: data.product.issue_date,
                    Maturity_Date: data.product.maturity_date,
                    Product_Type: data.product.product_type,
                    Product_Sub_Type: data.product.product_sub_type,
                    Product_Category: data.product.product_category
                }
            };
        }
        
        return data;
    } catch (error: any) {
        console.error('Error in getAlertProduct:', error);
        throw new Error(error.message || 'Failed to fetch product details');
    }
}

/**
 * Get the customer trade that triggered the alert
 */
export async function getAlertCustomerTrade(alertId: string) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_ENDPOINT}/alerts/${alertId}/customer-trade`, {
            headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Map snake_case to PascalCase
        if (data.customerTrade) {
            return {
                customerTrade: {
                    Trade_ID: data.customerTrade.trade_id,
                    Account_Name: data.customerTrade.account_name,
                    Trade_Side: data.customerTrade.trade_side,
                    Trade_Side_Name: data.customerTrade.trade_side_name,
                    Book_Code: data.customerTrade.book_code,
                    Standard_ID: data.customerTrade.standard_id,
                    Trade_Qty: data.customerTrade.trade_qty,
                    Trade_Price: data.customerTrade.trade_price,
                    Trade_Notional: data.customerTrade.trade_notional,
                    Trade_Date: data.customerTrade.trade_date,
                    Trade_Time: data.customerTrade.trade_time,
                    Trade_Entry_Date: data.customerTrade.trade_entry_date,
                    Event_Type: data.customerTrade.event_type,
                    Trader_Capacity: data.customerTrade.trader_capacity,
                    Trade_Source: data.customerTrade.trade_source,
                    Legal_Entity: data.customerTrade.legal_entity,
                    Algo: data.customerTrade.algo,
                    Trade_Type: data.customerTrade.trade_type,
                    Trader_ID: data.customerTrade.trader_id,
                    Trader_Name: data.customerTrade.trader_name,
                    Venue: data.customerTrade.venue,
                    Dealer_Name: data.customerTrade.dealer_name,
                    Is_Voice_Trade: data.customerTrade.is_voice_trade,
                    Trade_State: data.customerTrade.trade_state
                }
            };
        }
        
        return data;
    } catch (error: any) {
        console.error('Error in getAlertCustomerTrade:', error);
        throw new Error(error.message || 'Failed to fetch customer trade');
    }
}

/**
 * Get related trades (flagged trades) for an alert
 */
export async function getAlertRelatedTrades(alertId: string, limit = 50) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_ENDPOINT}/alerts/${alertId}/related-trades?limit=${limit}`, {
            headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Map snake_case to PascalCase for related trades
        if (data.relatedTrades && Array.isArray(data.relatedTrades)) {
            return {
                relatedTrades: data.relatedTrades.map((trade: any) => ({
                    Trade_ID: trade.trade_id,
                    Account_Name: trade.account_name,
                    Trade_Side: trade.trade_side,
                    Trade_Side_Name: trade.trade_side_name,
                    Book_Code: trade.book_code,
                    Standard_ID: trade.standard_id,
                    Trade_Qty: trade.trade_qty,
                    Trade_Price: trade.trade_price,
                    Trade_Date: trade.trade_date,
                    Trade_Time: trade.trade_time,
                    Trader_ID: trade.trader_id,
                    Trader_Name: trade.trader_name,
                    Venue: trade.venue,
                    Trade_State: trade.trade_state,
                    Trader_Capacity: trade.trader_capacity,
                    Legal_Entity: trade.legal_entity,
                    Trade_Type: trade.trade_type,
                    Is_Voice_Trade: trade.is_voice_trade
                })),
                count: data.count
            };
        }
        
        return data;
    } catch (error: any) {
        console.error('Error in getAlertRelatedTrades:', error);
        throw new Error(error.message || 'Failed to fetch related trades');
    }
}

/**
 * Trigger investigation for a single alert or multiple alerts
 */
export async function triggerInvestigation(
    request: TriggerInvestigationRequest
): Promise<TriggerInvestigationResponse> {
    try {
        const headers = await getAuthHeaders();
        const userId = await getUserId();

        // Build request body
        const body: any = {
            triggeredBy: request.triggeredBy || 'manual',
            triggeredByUser: request.triggeredByUser || userId,
        };

        // Single alert or multiple alerts
        if (request.alertId) {
            body.alertId = request.alertId;
        } else if (request.alertIds && request.alertIds.length > 0) {
            body.alertIds = request.alertIds;
        } else {
            throw new Error('Either alertId or alertIds must be provided');
        }

        const response = await fetch(`${API_ENDPOINT}/investigations/trigger`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: TriggerInvestigationResponse = await response.json();
        return data;
    } catch (error: any) {
        console.error('Error in triggerInvestigation:', error);
        throw new Error(error.message || 'Failed to trigger investigation');
    }
}

/**
 * Check if API endpoint is configured
 */
export function isApiConfigured(): boolean {
    return !!API_ENDPOINT;
}
