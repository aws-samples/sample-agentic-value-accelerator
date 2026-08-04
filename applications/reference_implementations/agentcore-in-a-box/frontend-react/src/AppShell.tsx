/**
 * AppShell — the persistent, role-aware control-panel shell.
 *
 * One shell for everyone: a left nav rail (sections filtered by role) + a top bar (persona
 * wordmark, desk switcher, theme, email, logout) + a content area that shows the active section.
 *   • Admins land on the Overview control panel; the operator surfaces (Access Control, Governance
 *     Graph, Registry, Express, Optimize) are embedded SECTIONS, not modals. Chat is one nav away.
 *   • Non-admins land on Desk Chat and keep Registry / Express / self-service Requests in the nav.
 *
 * Two structural rules, both load-bearing:
 *   1. ChatWorkspace stays MOUNTED (CSS-hidden) whenever it's not the active section — a turn runs
 *      as a background start→poll loop on a transient socket, and unmounting mid-run would orphan
 *      it (setState-after-unmount). Every other section mounts on activation and unmounts on leave.
 *   2. The desk switcher only calls setPersona; ChatWorkspace itself resets its session off the
 *      personaId change. The switcher is disabled while a chat turn is in flight (chatBusy).
 */
import { useCallback, useEffect, useState } from 'react';
import { Sun, Moon, X, ChevronRight, Menu, ShieldAlert } from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import type { Effective } from './entitlements';
import { usePersona } from './personaContext';
import { personaList, type PersonaDef } from './personas';
import { ChatWorkspace } from './ChatWorkspace';
import { Overview } from './Overview';
import { AdminConsole } from './AdminConsole';
import { KillSwitches } from './KillSwitches';
import { GovernanceGraph } from './GovernanceGraph';
import { GatewayConsole } from './GatewayConsole';
import { Registry } from './Registry';
import { Harness } from './Harness';
import { Optimization } from './Optimization';
import { RequestAccessSection } from './RequestAccess';
import { sectionsFor, type SectionId, type SectionDef } from './sections';
import { cn } from './lib/cn';

export function AppShell({
  auth, cfg, effective, isAdmin, freshLogin,
  theme, onToggleTheme,
  pendingRequests, onPendingCount,
}: {
  auth: Auth;
  cfg: AppConfig;
  effective: Effective | null;
  isAdmin: boolean;
  freshLogin: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  /** Live pending-request count (WS-driven at the App level) → nav badge + Overview. */
  pendingRequests: number;
  /** Reconcile the pending count when a section reloads it authoritatively. */
  onPendingCount: (n: number) => void;
}) {
  const { personaId, persona, setPersona } = usePersona();
  const sections = sectionsFor(isAdmin);
  const [section, setSection] = useState<SectionId>(isAdmin ? 'overview' : 'chat');  // nosemgrep  (react-props-in-state: initial useState value only, not a synced prop copy)
  const [navOpen, setNavOpen] = useState(false); // mobile nav drawer
  const [chatBusy, setChatBusy] = useState(false);
  // Ops-plane sections the operator has opened THIS chat session → StackRail "exercised" signal.
  const [visitedOps, setVisitedOps] = useState<string[]>([]);

  const email = auth.getUser()?.email || auth.getUser()?.['cognito:username'] || auth.getUser()?.username || 'signed in';

  // Navigate to a section; mark its ops-plane primitive exercised (honest StackRail signal) and
  // clear the pending badge when opening Access Control (mirrors the old header behavior).
  const go = useCallback((id: SectionId) => {
    const def = sections.find((s) => s.id === id);
    if (def?.opsKey) setVisitedOps((v) => (v.includes(def.opsKey!) ? v : [...v, def.opsKey!]));
    if (id === 'access') onPendingCount(0);
    setSection(id);
    setNavOpen(false);
  }, [sections, onPendingCount]);

  // If the role resolves after mount (e.g. isAdmin flips true once /me returns), keep the landing
  // sensible: a non-admin default of 'chat' is always valid; an admin default of 'overview' is set
  // initially. If the active section is no longer visible for the role, fall back to a safe one.
  useEffect(() => {
    if (!sections.some((s) => s.id === section)) {
      setSection(isAdmin ? 'overview' : 'chat');
    }
  }, [sections, section, isAdmin]);

  // Desk-entry enforcement (client half of "shouldn't even enter a desk you lack"). The login
  // picker offers all four desks pre-auth (entitlements aren't known yet); once /me resolves, if
  // the caller landed on a desk they're NOT entitled to, move them to their first entitled desk so
  // an un-entitled workspace never renders. Admins/unmanaged are unaffected (they see everything).
  // The runtime + WS-connect gates remain the authoritative walls; this is the UX reconciliation.
  const [deskNotice, setDeskNotice] = useState('');
  useEffect(() => {
    if (!effective || !effective.managed || isAdmin) return;
    if (effective.desks?.[personaId]) return; // current desk is entitled — nothing to do
    const firstAllowed = personaList().find((p) => effective.desks?.[p.id]);
    if (firstAllowed && firstAllowed.id !== personaId) {
      setPersona(firstAllowed.id);
      setDeskNotice(`You don't have access to that desk — switched you to ${firstAllowed.cardTitle}.`);
      setTimeout(() => setDeskNotice(''), 5000);
    }
  }, [effective, personaId, isAdmin, setPersona]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="relative flex shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu size={15} />
          </button>
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/20">
              <persona.Icon size={16} />
            </span>
            <span className="truncate text-[18px] font-extrabold tracking-[-0.01em]">{persona.wordmark}</span>
          </span>
          <span className="hidden h-5 w-px bg-border sm:inline-block" />
          <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground md:inline">
            {persona.tagline}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Desk switcher — global persona; ChatWorkspace resets its session on the change.
              Disabled while a chat turn is in flight so we never reset mid-run. */}
          <div className="relative hidden sm:block" title="Switch desk">
            <select
              value={personaId}
              onChange={(e) => {
                if (chatBusy || e.target.value === personaId) return;
                setPersona(e.target.value as PersonaDef['id']);
              }}
              disabled={chatBusy}
              aria-label="Switch desk"
              className="appearance-none rounded-md border border-border bg-secondary py-1.5 pl-2.5 pr-7 text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 cursor-pointer"
            >
              {personaList()
                // Show ONLY the desks the caller is entitled to (admins/unmanaged see all). The
                // active desk is always listed so the control never renders empty mid-switch.
                .filter((p) => {
                  const deskAllowed = !effective || !effective.managed || isAdmin || !!effective.desks?.[p.id];
                  return deskAllowed || p.id === personaId;
                })
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.cardTitle}
                  </option>
                ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90 size-3.5 text-muted-foreground" />
          </div>
          <span className="hidden rounded-md border border-border px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground lg:inline">
            {email}
          </span>
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <button
            onClick={() => auth.signOut()}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Body: nav rail + content ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Nav rail — inline at lg+, slide-in drawer below lg. */}
        {navOpen && (
          <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden" onClick={() => setNavOpen(false)} />
        )}
        <nav
          className={cn(
            'z-50 flex w-[220px] shrink-0 flex-col border-r border-border bg-card/70 backdrop-blur-sm',
            'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[80vw] max-lg:max-w-[260px] max-lg:shadow-2xl max-lg:transition-transform',
            navOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0',
          )}
        >
          <div className="flex items-center justify-between px-3 py-3 lg:hidden">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <span className="field-key">Sections</span>
            <button onClick={() => setNavOpen(false)} aria-label="Close navigation" className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
            {sections.map((s) => (
              <NavItem
                key={s.id}
                def={s}
                active={section === s.id}
                badge={s.id === 'access' ? pendingRequests : 0}
                onClick={() => go(s.id)}
              />
            ))}
          </div>
          <div className="border-t border-border px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-ok animate-pulse-dot" />
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                Live on AgentCore
              </span>
            </div>
          </div>
        </nav>

        {/* Content — Chat stays mounted (hidden) to protect the in-flight poll loop. */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className={cn('absolute inset-0 flex flex-col', section === 'chat' ? '' : 'hidden')}>
            <ChatWorkspace
              auth={auth}
              cfg={cfg}
              freshLogin={freshLogin}
              onBusyChange={setChatBusy}
              extraOpsActive={visitedOps}
              onNewThread={() => setVisitedOps([])}
              effective={effective}
            />
          </div>

          {section !== 'chat' && (
            <div className="absolute inset-0 flex flex-col">
              {section === 'overview' && isAdmin && (
                <Overview auth={auth} cfg={cfg} pendingCount={pendingRequests} onNavigate={go} onPendingCountChange={onPendingCount} />
              )}
              {section === 'access' && isAdmin && (
                <AdminConsole auth={auth} cfg={cfg} embedded onPendingCount={onPendingCount} />
              )}
              {section === 'killswitch' && isAdmin && (
                <KillSwitches auth={auth} cfg={cfg} />
              )}
              {section === 'graph' && isAdmin && (
                <GovernanceGraph auth={auth} cfg={cfg} isAdmin={isAdmin} embedded />
              )}
              {section === 'gateway' && isAdmin && (
                <GatewayConsole auth={auth} cfg={cfg} embedded onNavigate={(id) => go(id)} />
              )}
              {section === 'registry' && (
                <Registry auth={auth} cfg={cfg} isAdmin={isAdmin} embedded />
              )}
              {section === 'express' && (
                <Harness auth={auth} cfg={cfg} isAdmin={isAdmin} embedded />
              )}
              {section === 'optimize' && isAdmin && (
                <Optimization auth={auth} cfg={cfg} embedded />
              )}
              {section === 'requests' && !isAdmin && (
                <RequestAccessSection auth={auth} cfg={cfg} effective={effective} />
              )}
            </div>
          )}
        </div>
      </div>
      {deskNotice && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-4 py-2 text-[12.5px] shadow-2xl">
          <ShieldAlert size={14} className="text-primary" /> {deskNotice}
        </div>
      )}
    </div>
  );
}

function NavItem({
  def, active, badge, onClick,
}: {
  def: SectionDef; active: boolean; badge?: number; onClick: () => void;
}) {
  const { Icon } = def;
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" />}
      <Icon size={16} className="shrink-0" />
      <span className="flex-1 truncate">{def.label}</span>
      {!!badge && badge > 0 && (
        <span className="flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-5 text-destructive-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}
