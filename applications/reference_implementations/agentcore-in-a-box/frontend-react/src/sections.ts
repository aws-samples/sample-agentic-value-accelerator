// sections.ts — the shell's nav sections, shared so Overview quick-nav + AppShell agree on ids.
import {
  LayoutDashboard, MessageSquare, ShieldCheck, Network, BookMarked, Boxes, TrendingUp, Inbox,
  Waypoints, Ban,
  type LucideIcon,
} from 'lucide-react';

export type SectionId =
  | 'overview' | 'chat' | 'access' | 'killswitch' | 'graph' | 'gateway' | 'registry' | 'express' | 'optimize' | 'requests';

export interface SectionDef {
  id: SectionId;
  label: string;
  Icon: LucideIcon;
  adminOnly?: boolean;   // admin-gated (also enforced server-side)
  nonAdminOnly?: boolean; // only shown to non-admins (self-service)
  /** Which ops-plane primitive this section exercises, for the StackRail "this session" signal. */
  opsKey?: 'registry' | 'harness' | 'optimization';
}

// Nav order top→bottom. Overview is the admin landing; Chat is the user landing.
export const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview',        Icon: LayoutDashboard, adminOnly: true },
  { id: 'chat',     label: 'Desk Chat',       Icon: MessageSquare },
  { id: 'access',   label: 'Access Control',  Icon: ShieldCheck, adminOnly: true },
  { id: 'killswitch', label: 'Kill Switches', Icon: Ban, adminOnly: true },
  { id: 'graph',    label: 'Governance Graph', Icon: Network, adminOnly: true },
  { id: 'gateway',  label: 'Gateway',         Icon: Waypoints, adminOnly: true },
  { id: 'registry', label: 'Registry',        Icon: BookMarked, opsKey: 'registry' },
  { id: 'express',  label: 'Express',         Icon: Boxes, opsKey: 'harness' },
  { id: 'optimize', label: 'Optimize',        Icon: TrendingUp, adminOnly: true, opsKey: 'optimization' },
  { id: 'requests', label: 'Request Access',  Icon: Inbox, nonAdminOnly: true },
];

/** The sections visible to a given role. */
export function sectionsFor(isAdmin: boolean): SectionDef[] {
  return SECTIONS.filter((s) => {
    if (s.adminOnly && !isAdmin) return false;
    if (s.nonAdminOnly && isAdmin) return false;
    return true;
  });
}
