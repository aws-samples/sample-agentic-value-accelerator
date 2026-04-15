export type Domain = "market-surveillance" | "msp";

export interface DomainOption {
  id: Domain;
  name: string;
  description: string;
  route: string;
  enabled: boolean;
}

export const DOMAIN_OPTIONS: DomainOption[] = [
  {
    id: "market-surveillance",
    name: "Market Surveillance",
    description: "Monitor and investigate suspicious trading activities",
    route: "/",
    enabled: true,
  },
  {
    id: "msp",
    name: "Financial Risk",
    description: "Risk Analysis Assistant",
    route: "/msp",
    enabled: true,
  },
];
