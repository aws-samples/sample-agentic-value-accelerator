/**
 * Synthetic customer profiles for KYC demo.
 * Each profile represents a different risk pathway through the governance controls.
 */

export interface CustomerProfile {
  customer_id: string;
  name: string;
  short: string;
  decision: 'APPROVE' | 'ESCALATE' | 'BLOCK' | 'DECLINE';
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

export const CUSTOMER_PROFILES: CustomerProfile[] = [
  { customer_id: 'CUST001', name: 'Acme Corporation Ltd', short: 'Acme Corp', decision: 'APPROVE', risk_score: 22, risk_level: 'low', summary: 'Clean approval — low risk, strong financials' },
  { customer_id: 'CUST002', name: 'Al-Rashid Trading FZE', short: 'Al-Rashid (Dubai)', decision: 'APPROVE', risk_score: 44, risk_level: 'medium', summary: 'Medium risk — adverse media, Dubai entity, enhanced monitoring' },
  { customer_id: 'CUST003', name: 'Meridian Pension Trust', short: 'Meridian Pension', decision: 'APPROVE', risk_score: 18, risk_level: 'low', summary: 'Low risk but complex ownership — multi-layered pension fund' },
  { customer_id: 'CUST004', name: 'Kensington Holdings SA', short: 'Kensington (PEP)', decision: 'ESCALATE', risk_score: 62, risk_level: 'high', summary: 'PEP Level 1 — minister family member, financially clean, EDD required' },
  { customer_id: 'CUST005', name: 'Northgate Industrial Ltd', short: 'Northgate (Credit)', decision: 'DECLINE', risk_score: 28, risk_level: 'low', summary: 'Compliance clean but credit failure — D/E 8.0, multiple defaults' },
  { customer_id: 'CUST006', name: 'Pacific Ventures BVI', short: 'Pacific BVI (Shell)', decision: 'ESCALATE', risk_score: 71, risk_level: 'high', summary: 'Shell company indicators — nominee directors, minimal trading' },
  { customer_id: 'CUST007', name: 'GlobalFX Solutions Inc', short: 'GlobalFX ($500M)', decision: 'APPROVE', risk_score: 35, risk_level: 'medium', summary: 'High-volume legitimate — $500M FX, velocity checks triggered' },
  { customer_id: 'CUST008', name: 'Volkov Enterprises LLC', short: 'Volkov (Sanctioned)', decision: 'BLOCK', risk_score: 95, risk_level: 'critical', summary: 'Recently sanctioned — OFAC SDN addition, was previously clean' },
  { customer_id: 'CUST009', name: 'Syria Relief Foundation', short: 'Syria Relief (NGO)', decision: 'ESCALATE', risk_score: 58, risk_level: 'high', summary: 'Charity in conflict zone — Syria humanitarian, board review required' },
  { customer_id: 'CUST047', name: 'Omega Trading Ltd', short: 'Omega Trading', decision: 'BLOCK', risk_score: 81, risk_level: 'critical', summary: 'Sanctions match 78% + PEP + adverse media — mandatory block' },
];

export function getProfile(customerId: string): CustomerProfile | undefined {
  return CUSTOMER_PROFILES.find(p => p.customer_id === customerId);
}
