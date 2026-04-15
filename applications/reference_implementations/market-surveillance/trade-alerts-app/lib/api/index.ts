/**
 * API Module Exports
 * 
 * Central export point for API client and related types
 */

export { apiClient } from '../apiClient';
export type { ApiResponse, ApiError } from '../apiClient';

export { agentService } from './agentService';
export { messagesService } from './messagesService';
export { summariesService } from './summariesService';
export { 
    getAlerts, 
    getAlertDetails, 
    getAlertAccount, 
    getAlertProduct, 
    getAlertCustomerTrade, 
    getAlertRelatedTrades,
    triggerInvestigation,
    isApiConfigured 
} from './alertsService';
export type { AgentMessage, AgentStreamChunk, SendMessageOptions } from './agentService';
export type { SaveMessageRequest, GetMessagesResponse } from './messagesService';
export type { SummaryData, GetSummaryResponse } from './summariesService';
export type { 
    AlertFilters, 
    AlertsResponse, 
    TriggerInvestigationRequest, 
    TriggerInvestigationResponse 
} from './alertsService';

