export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  type: 'debit' | 'credit';
  description: string;
  merchant: string;
  isFraud: boolean;
  fraudType?: 'card_cloning' | 'identity_theft' | 'account_takeover' | 'synthetic_identity' | 'money_laundering';
  riskScore: number;
}

export interface Account {
  id: string;
  accountNumber: string;
  accountHolder: string;
  email: string;
  phone: string;
  address: string;
  accountType: 'checking' | 'savings' | 'credit';
  balance: number;
  creditLimit?: number;
  openDate: string;
  lastActivity: string;
}

export interface FinancialProfile {
  accountId: string;
  creditScore: number;
  income: number;
  employmentStatus: 'employed' | 'unemployed' | 'self_employed' | 'retired';
  riskLevel: 'low' | 'medium' | 'high';
  transactionPatterns: {
    averageMonthlySpend: number;
    typicalTransactionAmount: number;
    frequentMerchants: string[];
    unusualActivity: string[];
  };
}

export interface GenAIRecommendation {
  id: string;
  accountId: string;
  type: 'investigation' | 'monitoring' | 'action_required' | 'false_positive';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  confidence: number;
  suggestedActions: string[];
  createdAt: string;
}

