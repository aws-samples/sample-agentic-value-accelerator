/**
 * User identity helpers.
 *
 * The app runs behind a fixed shared demo login (enforced at the CDN/edge),
 * so there is no per-user account. To still get a sense of *who* is trying
 * the demo, we optionally capture a self-reported email and persist it in the
 * browser. Nothing here changes authentication.
 *
 * Storage model:
 *   - localStorage[USER_EMAIL_KEY]        → the email the visitor shared (persists across sessions)
 *   - sessionStorage[EMAIL_DISMISSED_KEY] → visitor skipped the prompt for this session only
 */

export const USER_EMAIL_KEY = "sr.userEmail";
export const EMAIL_DISMISSED_KEY = "sr.emailPromptDismissed";

/** Shown in the sidebar when the visitor hasn't shared an email. */
export const DEFAULT_EMAIL = "demo@example.com";

/**
 * Pragmatic email check — good enough to reject typos and empty input without
 * rejecting valid-but-unusual addresses. We deliberately keep it permissive.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || email.length > 254) return false;
  // one @, non-empty local part, a dot in the domain, no whitespace
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Read the stored email, or null if none / running on the server. */
export function readStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(USER_EMAIL_KEY);
    return stored && isValidEmail(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persist a shared email. Caller is expected to pass a validated value. */
export function writeStoredEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_EMAIL_KEY, email.trim());
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

/** Whether the visitor dismissed the prompt during this browser session. */
export function wasPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(EMAIL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark the prompt dismissed for this session (re-prompts on a new session). */
export function markPromptDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(EMAIL_DISMISSED_KEY, "1");
  } catch {
    /* non-fatal */
  }
}

/**
 * Two-letter avatar initials derived from an email's local part.
 * "demo@example.com" → "DE", "j@x.io" → "J".
 */
export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase();
  if (letters.length === 1) return letters[0].toUpperCase();
  return (local[0] ?? "?").toUpperCase();
}
