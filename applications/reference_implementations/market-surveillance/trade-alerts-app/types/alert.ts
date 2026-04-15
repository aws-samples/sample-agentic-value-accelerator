// API response format (snake_case from backend)
export interface AlertApiResponse {
    alert_id: number;
    alert_date: string;
    alert_time: string;
    alert_summary: string;
    isin: string;
    alert_account_id: string;
    account_name: string;
    account_number: string;
    alert_trade_id: string;
    trade_price: number;
    trade_qty: number;
    trade_side: 'B' | 'S';
    trade_side_name?: string;
    status?: 'pending' | 'investigating' | 'resolved';
    alert_risk_score?: number | null;
}

// Frontend format (PascalCase for consistency with existing code)
export interface Alert {
    Alert_ID: string;
    Account_Name: string;
    Account_Number: string;
    Alert_Date: string;
    Alert_time: string;
    Alert_Summary: string;
    ISIN: string;
    Trade_Price: number;
    Trade_Qty: number;
    Trade_Side: 'B' | 'S';
    Trade_Side_Name?: string;
    status?: 'pending' | 'investigating' | 'resolved';
    Alert_Risk_Score: number | null;
}

// Utility function to convert API response to frontend format
export function mapAlertFromApi(apiAlert: AlertApiResponse): Alert {
    return {
        Alert_ID: String(apiAlert.alert_id),
        Account_Name: apiAlert.account_name,
        Account_Number: apiAlert.account_number,
        Alert_Date: apiAlert.alert_date,
        Alert_time: apiAlert.alert_time,
        Alert_Summary: apiAlert.alert_summary,
        ISIN: apiAlert.isin,
        Trade_Price: apiAlert.trade_price,
        Trade_Qty: apiAlert.trade_qty,
        Trade_Side: apiAlert.trade_side,
        Trade_Side_Name: apiAlert.trade_side_name,
        status: apiAlert.status || 'pending',
        Alert_Risk_Score: apiAlert.alert_risk_score ?? null
    };
}

export interface InvestigationStep {
    id: string;
    timestamp: string;
    action: string;
    findings: string;
    agent: string;
}

export interface Investigation {
    alertId: string;
    startedAt: string;
    status: 'in-progress' | 'completed';
    steps: InvestigationStep[];
}
