import { Transaction, Account, FinancialProfile, GenAIRecommendation } from '../types';

export const sampleTransactions: Transaction[] = [
  {
    id: '1',
    accountId: 'acc-001',
    amount: 2500.00,
    date: '2024-01-15T10:30:00Z',
    type: 'debit',
    description: 'Online Purchase - Electronics Store',
    merchant: 'TechMart Inc.',
    isFraud: true,
    fraudType: 'card_cloning',
    riskScore: 95
  },
  {
    id: '2',
    accountId: 'acc-002',
    amount: 120.50,
    date: '2024-01-15T14:22:00Z',
    type: 'debit',
    description: 'Grocery Store Purchase',
    merchant: 'Fresh Foods',
    isFraud: false,
    riskScore: 15
  },
  {
    id: '3',
    accountId: 'acc-003',
    amount: 5000.00,
    date: '2024-01-14T09:15:00Z',
    type: 'debit',
    description: 'Wire Transfer - International',
    merchant: 'International Bank',
    isFraud: true,
    fraudType: 'money_laundering',
    riskScore: 88
  },
  {
    id: '4',
    accountId: 'acc-001',
    amount: 75.00,
    date: '2024-01-14T16:45:00Z',
    type: 'debit',
    description: 'Gas Station',
    merchant: 'QuickFill Gas',
    isFraud: false,
    riskScore: 25
  },
  {
    id: '5',
    accountId: 'acc-004',
    amount: 15000.00,
    date: '2024-01-13T11:20:00Z',
    type: 'debit',
    description: 'Luxury Purchase',
    merchant: 'Luxury Boutique',
    isFraud: true,
    fraudType: 'identity_theft',
    riskScore: 92
  },
  {
    id: '6',
    accountId: 'acc-002',
    amount: 200.00,
    date: '2024-01-13T13:30:00Z',
    type: 'credit',
    description: 'Salary Deposit',
    merchant: 'Employer Corp',
    isFraud: false,
    riskScore: 5
  },
  {
    id: '7',
    accountId: 'acc-005',
    amount: 3000.00,
    date: '2024-01-12T08:00:00Z',
    type: 'debit',
    description: 'Cryptocurrency Purchase',
    merchant: 'CryptoExchange',
    isFraud: true,
    fraudType: 'synthetic_identity',
    riskScore: 85
  },
  {
    id: '8',
    accountId: 'acc-003',
    amount: 45.00,
    date: '2024-01-12T19:15:00Z',
    type: 'debit',
    description: 'Restaurant',
    merchant: 'Local Bistro',
    isFraud: false,
    riskScore: 20
  }
];

export const sampleAccounts: Account[] = [
  {
    id: 'acc-001',
    accountNumber: '****1234',
    accountHolder: 'John Smith',
    email: 'john.smith@email.com',
    phone: '+1-555-0123',
    address: '123 Main St, Anytown, USA',
    accountType: 'checking',
    balance: 2500.00,
    openDate: '2020-03-15',
    lastActivity: '2024-01-15T10:30:00Z'
  },
  {
    id: 'acc-002',
    accountNumber: '****5678',
    accountHolder: 'Sarah Johnson',
    email: 'sarah.johnson@email.com',
    phone: '+1-555-0456',
    address: '456 Oak Ave, Somewhere, USA',
    accountType: 'savings',
    balance: 15000.00,
    openDate: '2019-07-22',
    lastActivity: '2024-01-15T14:22:00Z'
  },
  {
    id: 'acc-003',
    accountNumber: '****9012',
    accountHolder: 'Michael Brown',
    email: 'michael.brown@email.com',
    phone: '+1-555-0789',
    address: '789 Pine Rd, Elsewhere, USA',
    accountType: 'checking',
    balance: 8500.00,
    openDate: '2021-11-08',
    lastActivity: '2024-01-14T09:15:00Z'
  },
  {
    id: 'acc-004',
    accountNumber: '****3456',
    accountHolder: 'Emily Davis',
    email: 'emily.davis@email.com',
    phone: '+1-555-0321',
    address: '321 Elm St, Nowhere, USA',
    accountType: 'credit',
    balance: -2500.00,
    creditLimit: 10000.00,
    openDate: '2022-05-12',
    lastActivity: '2024-01-13T11:20:00Z'
  },
  {
    id: 'acc-005',
    accountNumber: '****7890',
    accountHolder: 'David Wilson',
    email: 'david.wilson@email.com',
    phone: '+1-555-0654',
    address: '654 Maple Dr, Anywhere, USA',
    accountType: 'checking',
    balance: 12000.00,
    openDate: '2020-09-30',
    lastActivity: '2024-01-12T08:00:00Z'
  }
];

export const sampleFinancialProfiles: FinancialProfile[] = [
  {
    accountId: 'acc-001',
    creditScore: 720,
    income: 75000,
    employmentStatus: 'employed',
    riskLevel: 'medium',
    transactionPatterns: {
      averageMonthlySpend: 3500,
      typicalTransactionAmount: 150,
      frequentMerchants: ['Amazon', 'Local Grocery', 'Gas Station'],
      unusualActivity: ['Large electronics purchase', 'Unusual time of day']
    }
  },
  {
    accountId: 'acc-002',
    creditScore: 780,
    income: 95000,
    employmentStatus: 'employed',
    riskLevel: 'low',
    transactionPatterns: {
      averageMonthlySpend: 2800,
      typicalTransactionAmount: 85,
      frequentMerchants: ['Whole Foods', 'Target', 'Netflix'],
      unusualActivity: []
    }
  },
  {
    accountId: 'acc-003',
    creditScore: 650,
    income: 55000,
    employmentStatus: 'employed',
    riskLevel: 'high',
    transactionPatterns: {
      averageMonthlySpend: 4200,
      typicalTransactionAmount: 200,
      frequentMerchants: ['Online Casinos', 'Cryptocurrency Exchanges'],
      unusualActivity: ['International transfers', 'High-risk merchants']
    }
  },
  {
    accountId: 'acc-004',
    creditScore: 680,
    income: 68000,
    employmentStatus: 'employed',
    riskLevel: 'medium',
    transactionPatterns: {
      averageMonthlySpend: 3800,
      typicalTransactionAmount: 180,
      frequentMerchants: ['Department Stores', 'Restaurants', 'Entertainment'],
      unusualActivity: ['Luxury purchases', 'Unusual spending patterns']
    }
  },
  {
    accountId: 'acc-005',
    creditScore: 590,
    income: 45000,
    employmentStatus: 'self_employed',
    riskLevel: 'high',
    transactionPatterns: {
      averageMonthlySpend: 5000,
      typicalTransactionAmount: 300,
      frequentMerchants: ['Cryptocurrency Exchanges', 'Online Trading'],
      unusualActivity: ['High-frequency trading', 'Cryptocurrency transactions']
    }
  }
];

export const sampleGenAIRecommendations: GenAIRecommendation[] = [
  {
    id: 'rec-001',
    accountId: 'acc-001',
    type: 'investigation',
    priority: 'high',
    title: 'Suspicious Card Cloning Activity Detected',
    description: 'Multiple transactions from cloned card detected. Immediate investigation required.',
    confidence: 0.95,
    suggestedActions: [
      'Freeze the compromised card immediately',
      'Issue a new card to the customer',
      'Review all recent transactions for this account',
      'Contact customer to verify recent activity'
    ],
    createdAt: '2024-01-15T10:35:00Z'
  },
  {
    id: 'rec-002',
    accountId: 'acc-003',
    type: 'action_required',
    priority: 'critical',
    title: 'Potential Money Laundering Pattern',
    description: 'Large international transfer with suspicious pattern matching money laundering indicators.',
    confidence: 0.88,
    suggestedActions: [
      'Flag account for enhanced monitoring',
      'Request additional documentation',
      'Report to compliance team',
      'Consider account restrictions'
    ],
    createdAt: '2024-01-14T09:20:00Z'
  },
  {
    id: 'rec-003',
    accountId: 'acc-004',
    type: 'monitoring',
    priority: 'medium',
    title: 'Unusual Spending Pattern Detected',
    description: 'Recent luxury purchase significantly exceeds typical spending patterns.',
    confidence: 0.72,
    suggestedActions: [
      'Monitor account for additional unusual activity',
      'Send fraud prevention alert to customer',
      'Review account for potential compromise'
    ],
    createdAt: '2024-01-13T11:25:00Z'
  },
  {
    id: 'rec-004',
    accountId: 'acc-005',
    type: 'investigation',
    priority: 'high',
    title: 'Synthetic Identity Fraud Suspected',
    description: 'Account shows characteristics of synthetic identity creation.',
    confidence: 0.85,
    suggestedActions: [
      'Verify customer identity documents',
      'Cross-reference with external databases',
      'Consider account closure if confirmed',
      'Report to fraud prevention team'
    ],
    createdAt: '2024-01-12T08:05:00Z'
  }
];

