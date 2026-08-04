import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Workflow, ShieldCheck, Activity, KeyRound, ArrowRight, LogOut, ShieldAlert, type LucideIcon } from 'lucide-react';
import { Auth } from './auth';
import { AppShell } from './AppShell';
import { useEntitlements } from './useEntitlements';
import { usePersona } from './personaContext';
import { personaList, type PersonaDef } from './personas';
import { allows } from './entitlements';
import { cn } from './lib/cn';

function useTheme() {
  // Paper is the default look (base :root); dark is the opt-in companion (`.dark` on <html>).
  const [theme, setTheme] = useState<'dark' | 'light'>(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  const toggle = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem('meridian-theme', next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };
  return { theme, toggle };
}

export function App() {
  const cfg = window.APP_CONFIG;
  const auth = useMemo(() => new Auth(cfg), [cfg]);
  const { theme, toggle } = useTheme();
  const { personaId, setPersona } = usePersona();
  const email = auth.getUser()?.email || auth.getUser()?.['cognito:username'] || auth.getUser()?.username || 'signed in';

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState('');
  // Desk selection is now a POST-login step (least-privilege: you only see the desks you're
  // entitled to, and only after we know who you are). deskReady gates the shell behind it.
  const [deskReady, setDeskReady] = useState(false);

  // Captured at first render — BEFORE auth.handleRedirect() strips ?code= from the URL — so a
  // late-mounting ChatWorkspace (an admin who lands on Overview) can still tell a fresh Hosted-UI
  // sign-in from a plain refresh, and start a clean session only on a genuine login.
  const freshLoginRef = useRef(
    typeof window !== 'undefined' && window.location.search.includes('code='),
  );

  // ---- Governance request/approve: live notifications + pending badge ----
  // The two access_request_* frames the request/approve workflow raises reach the shell here:
  //   • access_request_created  → admin: bump the pending badge + toast
  //   • access_request_resolved → requester: toast the outcome (the grant's own
  //     entitlements_changed already refreshed state, so we don't refetch here)
  const [pendingRequests, setPendingRequests] = useState(0);
  const [accessToast, setAccessToast] = useState('');
  const isAdminRef = useRef(false);
  const onGovFrame = useCallback((frame: any) => {
    if (frame?.type === 'access_request_created') {
      if (isAdminRef.current) {
        setPendingRequests((n) => n + 1);
        setAccessToast(`New access request from ${frame?.request?.requesterEmail || 'a user'}.`);
        setTimeout(() => setAccessToast(''), 4000);
      }
    } else if (frame?.type === 'access_request_resolved') {
      const st = frame?.request?.status;
      setAccessToast(st === 'APPROVED' ? 'Your access request was approved.' : 'Your access request was denied.');
      setTimeout(() => setAccessToast(''), 4000);
    }
  }, []);

  // ---- Admin-managed RBAC: the caller's live entitlements + admin gate ----
  // Loads /me/entitlements and subscribes to entitlements_changed WS pushes (persistent socket),
  // so a revoke by the admin re-renders THIS user's UI within ~1s.
  const { effective, isAdmin, loading: entLoading, version: entVersion } = useEntitlements(auth, cfg, authed, onGovFrame);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  // Flash a small notice to a non-admin whenever their access changes under them.
  const prevEntVersion = useRef(entVersion);
  useEffect(() => {
    if (entVersion > prevEntVersion.current && prevEntVersion.current > 0 && !isAdmin) {
      setAccessToast('Your access was updated by an administrator.');
      const t = setTimeout(() => setAccessToast(''), 4000);
      prevEntVersion.current = entVersion;
      return () => clearTimeout(t);
    }
    prevEntVersion.current = entVersion;
  }, [entVersion, isAdmin]);

  // ---- Post-login desk selection (least-privilege) ----
  // The desks this signed-in user may enter. Admins/unmanaged callers see all four; a managed
  // user sees only their entitled desks. Computed from the live effective view; empty for a
  // managed user with no desk grants (a real "no access yet" state, handled explicitly below).
  const entitledDesks = useMemo<PersonaDef[]>(() => {
    const all = personaList();
    if (isAdmin || !effective || !effective.managed) return all;
    return all.filter((p) => allows(effective, 'desks', p.id));
  }, [effective, isAdmin]);

  // Auto-enter when there's no real choice to make; otherwise the DeskGate (below) lets the user
  // pick from only their entitled desks. Runs once entitlements have loaded post-auth.
  //   • Admins govern rather than work a desk (they land on Overview) — skip the gate entirely.
  //   • Exactly one entitled desk → enter it directly (no needless click).
  //   • 2+ desks → show the gate; if the persisted persona isn't entitled, snap to the first one
  //     that is so the shell never opens on a denied desk.
  useEffect(() => {
    if (!authed || entLoading || deskReady) return;
    if (isAdmin || entitledDesks.length === 1) {
      if (entitledDesks.length && !entitledDesks.some((p) => p.id === personaId)) {
        setPersona(entitledDesks[0].id);
      }
      setDeskReady(true);
    } else if (entitledDesks.length > 1 && !entitledDesks.some((p) => p.id === personaId)) {
      setPersona(entitledDesks[0].id);
    }
  }, [authed, entLoading, deskReady, isAdmin, entitledDesks, personaId, setPersona]);

  // ---- Auth bootstrap: handle the Hosted UI redirect, else check existing session ----
  useEffect(() => {
    (async () => {
      try {
        if (window.location.search.includes('code=')) {
          await auth.handleRedirect();
        }
      } catch (e: any) {
        setLoginError(e?.message || 'Login failed');
      }
      setAuthed(auth.isAuthenticated());
      setReady(true);
    })();
  }, [auth]);

  if (!ready) {
    return (
      /* nosemgrep: jsx-not-internationalized (single-locale demo) */
      <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  // 1) Not signed in → the persona picker. Click a card → Cognito Hosted UI
  // opens with the email pre-filled; user pastes the shared demo password.
  // 3LO consent-reuse is preserved because we still route through Hosted UI.
  if (!authed) {
    return <PersonaLogin onSignInAs={(email) => auth.login(email)} loginError={loginError} />;
  }

  // 2) Signed in, still resolving entitlements → brief hold so we never flash a desk you can't enter.
  if (entLoading && !deskReady) {
    return (
      /* nosemgrep: jsx-not-internationalized (single-locale demo) */
      <div className="flex h-screen items-center justify-center text-muted-foreground">Loading your desks…</div>
    );
  }

  // 3) Signed in but entitled to NO desk → an honest "request access" wall (managed, zero grants).
  if (deskReady === false && entitledDesks.length === 0) {
    return <NoDeskAccess email={email} onSignOut={() => auth.signOut()} />;
  }

  // 4) Signed in, entitled to 2+ desks, none chosen yet → the filtered desk gate (only your desks).
  if (!deskReady) {
    return (
      <DeskGate
        desks={entitledDesks}
        personaId={personaId}
        setPersona={setPersona}
        onEnter={() => setDeskReady(true)}
        email={email}
        onSignOut={() => auth.signOut()}
      />
    );
  }

  // 5) Desk chosen → the shell.
  return (
    <>
      <AppShell
        auth={auth}
        cfg={cfg}
        effective={effective}
        isAdmin={isAdmin}
        freshLogin={freshLoginRef.current}
        theme={theme}
        onToggleTheme={toggle}
        pendingRequests={pendingRequests}
        onPendingCount={setPendingRequests}
      />
      {accessToast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-4 py-2 text-[12.5px] shadow-2xl">
          <ShieldCheck size={14} className="text-primary" /> {accessToast}
        </div>
      )}
    </>
  );
}

// ── Login: sign in FIRST; desk selection is a post-auth, entitlement-scoped step ───────────────
// Identity comes before desk choice — a user only ever sees the desks they're authorized to enter,
// and only after we know who they are (least-privilege). The login cover therefore no longer picks
// a desk; the DeskGate (below) does, showing ONLY the caller's entitled desks. All four verticals
// still share one Cognito user pool.
const LOGIN_PROOFS: { Icon: LucideIcon; label: string; sub: string }[] = [
  { Icon: Workflow, label: 'Multi-agent swarm', sub: 'specialists hand off live' },
  { Icon: ShieldCheck, label: 'Governed by Cedar', sub: 'policy-enforced tools' },
  { Icon: KeyRound, label: 'Delegated identity', sub: 'acts on your behalf' },
  { Icon: Activity, label: 'Fully observable', sub: 'every step traced' },
];

// ── AVA demo persona picker: 9 seeded users on one page ─────────────────────
// Click a persona card → we call auth.login(email) which redirects to the
// Cognito Hosted UI with `login_hint=<email>` (email field pre-populated).
// The demo password `DemoPassword2026` is shown on each card with a copy-to-
// clipboard button — user pastes it into the Hosted UI and clicks Sign In.
//
// Why keep the Hosted UI in the flow: the Cognito session cookie set on the
// auth domain is what the 3-legged (USER_FEDERATION) consent step for
// `positions_view` / `trade_execute` reuses to avoid re-prompting. Skipping
// the Hosted UI would break that headline governance demo.
const DEMO_PASSWORD = 'DemoPassword2026';
type DemoPersona = {
  email: string;
  name: string;
  role: string;
  firm: string;
  desk: string;
  description: string;
  isAdmin?: boolean;
};
// Order: 8 non-admin personas first (grouped by vertical), Admin last.
const DEMO_PERSONAS: DemoPersona[] = [
  { email: 'alice@demo.com', name: 'Alice Chen',       role: 'Portfolio Manager',              firm: 'AgentCore in a Box',  desk: 'Capital Markets',
    description: 'Manages Core Bond Fund and Short Duration Income Fund. Runs a full desk review across build → attribute → ESG-screen → liquidity, culminating in an Investment Committee verdict.' },
  { email: 'bob@demo.com',   name: 'Bob Nakamura',     role: 'Portfolio Manager',              firm: 'AgentCore in a Box',  desk: 'Capital Markets',
    description: 'Manages the Government Securities Fund. Same investment desk workflow as Alice, scoped to US Treasuries + TIPS with senior-tier visibility over positions data.' },
  { email: 'uw1@demo.com',   name: 'Dana Okafor',      role: 'Underwriting Portfolio Manager', firm: 'Ridgeline Mutual',    desk: 'Insurance',
    description: 'Coastal & Middle-Market Property books. Full underwriting-committee workflow — build book → attribute vs plan → cat-model against reinsurance → fraud-screen → BIND decision.' },
  { email: 'uw2@demo.com',   name: 'Marcus Feld',      role: 'Underwriting Portfolio Manager', firm: 'Ridgeline Mutual',    desk: 'Insurance',
    description: 'Umbrella & Excess Casualty and Group Term Life books. Same underwriting workflow with severity-capped GL and mortality-managed portfolios.' },
  { email: 'rm1@demo.com',   name: 'Dana Whitfield',   role: 'Senior Credit Officer',          firm: 'Rampart Financial',   desk: 'Banking',
    description: 'Commercial & Industrial and Small Business books. Full credit-desk workflow — re-underwrite → re-price → sanctions/adverse media → portfolio EL → Credit Committee decision.' },
  { email: 'rm2@demo.com',   name: 'Marcus Lindqvist', role: 'Credit Risk Director',           firm: 'Rampart Financial',   desk: 'Banking',
    description: 'Commercial Real Estate book. Same workflow tuned for stabilized CRE with LTV/DSCR discipline and workout/restructure playbooks.' },
  { email: 'ops1@demo.com',  name: 'Maya Okafor',      role: 'Risk & Growth Lead',             firm: 'Kairo',               desk: 'FinTech',
    description: 'Consumer Wallet and Prepaid Card programs. Full risk & growth review — approval rate → fraud → chargeback → GMV vs plan → Risk & Growth Council ship/hold verdict.' },
  { email: 'ops2@demo.com',  name: 'Diego Alvarez',    role: 'Head of Risk & Growth',          firm: 'Kairo',               desk: 'FinTech',
    description: 'SMB Card program. Same workflow scoped to corporate charge / virtual cards / expense cards with credit-line growth vs expected-loss balancing.' },
  { email: 'admin@demo.com', name: 'Admin',            role: 'Access Control Administrator',   firm: 'AVA Platform',        desk: 'ALL',
    description: 'Governance and RBAC administrator. Grants/revokes tool + credential access for every user and agent across all four verticals from the Access Control console. Revocations are enforced at 4 defense-in-depth layers live.',
    isAdmin: true },
];

function PersonaLogin({
  onSignInAs,
  loginError,
}: {
  onSignInAs: (email: string) => void;
  loginError: string;
}) {
  // copiedFor holds the email of the row whose Copy button was just clicked
  // (empty string = nothing copied). We use it to flip that row's button
  // label to "Copied ✓" for ~1.6s. Only one row can be in the "just copied"
  // state at a time, which matches the shared-password reality.
  const [copiedFor, setCopiedFor] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const copyPasswordFor = async (email: string, e: MouseEvent) => {
    e.stopPropagation();  // don't trigger the row's sign-in click
    try {
      await navigator.clipboard.writeText(DEMO_PASSWORD);
      setCopiedFor(email);
      setTimeout(() => setCopiedFor((cur) => (cur === email ? '' : cur)), 1600);
    } catch {
      /* clipboard unavailable — silently no-op; the password is visible on the row */
    }
  };
  const signIn = (p: DemoPersona) => {
    setBusy(p.email);
    onSignInAs(p.email);
  };
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="surface-hero relative w-full max-w-5xl overflow-hidden">
        {/* Masthead */}
        <div className="flex items-center justify-between gap-3 px-6 py-3.5 sm:px-9">
          <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
            AgentCore in a Box — Demo Sign-In
          </span>
          <span className="live-pill shrink-0">
            <span className="dot" />
            Amazon Bedrock AgentCore
          </span>
        </div>
        <div className="rule" />

        {/* Head */}
        <div className="px-6 pt-6 text-center sm:px-9">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <h1 className="mx-auto max-w-2xl text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[30px]">
            Choose a persona to sign in
          </h1>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <p className="mx-auto mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            Click a card and the Cognito sign-in page opens with the email pre-filled. Paste the
            shared demo password below and hit Sign In. Admin uses a separate password that only
            operators know — clicking Admin lets you type it into the Hosted UI.
          </p>
        </div>

        {/* 9 horizontal persona rows. Each row is a 3-column tile:
              [Desk] | [Name + Role + Email] | [Description] */}
        <div className="px-6 py-5 sm:px-9">
          <div className="flex flex-col gap-2">
            {DEMO_PERSONAS.map((p) => {
              const isBusy = busy === p.email;
              const isAnyBusy = !!busy;
              return (
                /* nosemgrep: jsx-not-internationalized (single-locale demo) */
                <button
                  key={p.email}
                  onClick={() => signIn(p)}
                  disabled={isAnyBusy}
                  className={cn(
                    'group relative grid w-full grid-cols-1 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-all',
                    'sm:grid-cols-[minmax(140px,180px)_minmax(200px,260px)_1fr]',
                    'hover:border-primary/50 hover:shadow-md enabled:hover:-translate-y-px',
                    'disabled:opacity-60 disabled:cursor-wait',
                    p.isAdmin && 'ring-1 ring-primary/30',
                  )}
                >
                  {/* Column 1 — Desk (vertical name; ALL for admin). */}
                  <div className="flex items-center gap-2 border-b border-border/60 pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider',
                        p.isAdmin
                          ? 'bg-primary/12 text-primary ring-1 ring-primary/25'
                          : 'bg-muted/40 text-foreground ring-1 ring-border',
                      )}
                    >
                      {p.desk}
                    </span>
                    {p.isAdmin && (
                      /* nosemgrep: jsx-not-internationalized (single-locale demo) */
                      <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                        Admin
                      </span>
                    )}
                  </div>

                  {/* Column 2 — Name, role, email. */}
                  <div className="flex flex-col gap-0.5 border-b border-border/60 pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
                    <span className="text-[13.5px] font-semibold text-foreground">
                      {p.name}
                    </span>
                    <span className="text-[11.5px] leading-tight text-muted-foreground">
                      {p.role} · {p.firm}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {p.email}
                    </span>
                  </div>

                  {/* Column 3 — Description + password (or "Password required" for admin). */}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11.5px] leading-snug text-muted-foreground">
                      {p.description}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {p.isAdmin ? (
                        /* nosemgrep: jsx-not-internationalized (single-locale demo) */
                        <span className="rounded-md bg-amber-500/10 px-2 py-1 text-[10.5px] font-semibold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
                          Password required
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                          <code className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] font-semibold text-foreground">
                            {DEMO_PASSWORD}
                          </code>
                          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => copyPasswordFor(p.email, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                copyPasswordFor(p.email, e as unknown as MouseEvent);
                              }
                            }}
                            className="cursor-pointer rounded-md border border-primary/40 bg-card px-2 py-1 text-[10.5px] font-semibold text-primary transition-all hover:bg-primary/10"
                          >
                            {copiedFor === p.email ? 'Copied ✓' : 'Copy'}
                          </span>
                        </div>
                      )}
                      <span className="flex items-center gap-1 text-[10.5px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        {isBusy ? 'Redirecting…' : (
                          <>
                            Sign in as {p.name.split(' ')[0]}
                            <ArrowRight size={11} />
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {loginError && (
            /* nosemgrep: jsx-not-internationalized (single-locale demo) */
            <p className="mt-4 text-center text-sm text-destructive">{loginError}</p>
          )}
        </div>

        {/* Footer: the four primitives as a hairline-ruled register row */}
        <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {LOGIN_PROOFS.map((p, i) => (
            <div
              key={p.label}
              className={cn(
                'flex items-start gap-2 px-4 py-3.5',
                i % 2 === 0 && 'border-r border-border',
                i < 2 && 'border-b sm:border-b-0',
                i === 2 && 'sm:border-r',
              )}
            >
              <p.Icon size={14} className="mt-0.5 shrink-0 text-primary" />
              <span className="min-w-0 leading-tight">
                <span className="block text-[11.5px] font-semibold text-foreground">{p.label}</span>
                <span className="block text-[10px] text-muted-foreground">{p.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Post-login desk gate: choose from ONLY the desks this user is entitled to enter. ────────────
// Shown when a caller has 2+ entitled desks (a single-desk user is auto-entered; a zero-desk user
// sees NoDeskAccess). Selecting a card sets the persona (reskinning the shell) and enters.
function DeskGate({
  desks, personaId, setPersona, onEnter, email, onSignOut,
}: {
  desks: PersonaDef[];
  personaId: string;
  setPersona: (id: PersonaDef['id']) => void;
  onEnter: () => void;
  email: string;
  onSignOut: () => void;
}) {
  const active = desks.find((p) => p.id === personaId) || desks[0];
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="surface-hero relative w-full max-w-2xl overflow-hidden">
        {/* Masthead: who's signed in + a sign-out escape. */}
        <div className="flex items-center justify-between gap-3 px-6 py-3.5 sm:px-9">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/20">
              <ShieldCheck size={15} />
            </span>
            <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
              {email}
            </span>
          </span>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <button
            onClick={onSignOut}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
        <div className="rule" />

        <div className="stagger px-6 pt-7 text-center sm:px-9">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="field-key" style={{ ['--i' as string]: 0 }}>Signed in · choose your desk</div>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <h1
            className="mx-auto mt-2 max-w-lg text-[26px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[32px]"
            style={{ ['--i' as string]: 1 }}
          >
            Which desk are you working today?
          </h1>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <p
            className="mx-auto mt-3 max-w-md text-[12.5px] leading-relaxed text-muted-foreground"
            style={{ ['--i' as string]: 2 }}
          >
            You're authorized for {desks.length} desks. Pick one to enter — you can switch between
            your authorized desks anytime.
          </p>
        </div>

        <div className="px-6 pt-6 sm:px-9">
          <div className="grid grid-cols-1 overflow-hidden rounded-md border border-border sm:grid-cols-2">
            {desks.map((p, idx) => {
              const isActive = p.id === active.id;
              const Icon = p.Icon;
              const odd = desks.length % 2 === 1 && idx === desks.length - 1;
              return (
                <button
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'group relative flex items-start gap-2.5 border-border p-3.5 text-left transition-colors duration-150',
                    idx % 2 === 0 && !odd && 'sm:border-r',
                    odd && 'sm:col-span-2 sm:border-t',
                    idx < desks.length - (desks.length % 2 === 0 ? 2 : 1) && 'border-b',
                    isActive ? 'bg-primary/8' : 'bg-transparent hover:bg-secondary/50',
                  )}
                >
                  {isActive && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors',
                      isActive ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[13px] font-semibold', isActive ? 'text-primary' : 'text-foreground')}>
                      {p.cardTitle}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{p.cardBlurb}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <button
            className="group mb-7 mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 enabled:hover:-translate-y-px"
            onClick={onEnter}
          >
            Enter {active.cardTitle}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Signed in but entitled to NO desk: an honest wall (managed user, zero desk grants). ─────────
function NoDeskAccess({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="surface-hero relative w-full max-w-md overflow-hidden p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-destructive/12 text-destructive ring-1 ring-destructive/20">
          <ShieldAlert size={24} />
        </div>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <h1 className="text-[19px] font-bold tracking-tight">No desk access yet</h1>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <p className="mx-auto mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
          You're signed in as <span className="font-medium text-foreground">{email}</span>, but your
          account isn't authorized for any desk. Ask an administrator to grant desk access in the
          Access Control console.
        </p>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <button
          onClick={onSignOut}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-4 py-2 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
