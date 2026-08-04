/**
 * MaskedIdentity — Displays sensitive identity data with masking and reveal toggle.
 *
 * By default shows a masked version (e.g., "jsmith@..." or "Admin-****"). User can
 * click the eye icon to reveal the full identity. Resets to masked after a timeout.
 *
 * Use for: actor names, caller identities, usernames, email addresses, ARNs.
 */
import { useState, useEffect, useCallback } from 'react';

interface Props {
  /** Full identity string to display */
  identity: string;
  /** Auto-hide timeout in ms after reveal (default 10s, 0 = never auto-hide) */
  revealTimeout?: number;
  /** Additional CSS classes for the container */
  className?: string;
}

/** Mask an identity for display: show first segment + ellipsis or role-**** pattern. */
function maskIdentity(identity: string): string {
  if (!identity) return '—';

  // Email pattern: show first part + domain hint
  if (identity.includes('@')) {
    const [local, domain] = identity.split('@');
    const maskedLocal = local.length > 3 ? `${local.slice(0, 3)}...` : local;
    const domainHint = domain.split('.')[0].slice(0, 4);
    return `${maskedLocal}@${domainHint}...`;
  }

  // ARN pattern: extract resource name, mask session suffix
  if (identity.startsWith('arn:')) {
    const tail = identity.split('/').pop() || identity.split(':').pop() || identity;
    return maskIdentity(tail);
  }

  // Path pattern: take last segment
  if (identity.includes('/')) {
    const tail = identity.split('/').pop() || identity;
    return maskIdentity(tail);
  }

  // Session suffix pattern: name-<random> → name-****
  const parts = identity.split('-');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    // If last segment looks like a random token (6+ chars with digits), mask it
    if (last.length >= 6 && /\d/.test(last)) {
      return `${parts.slice(0, -1).join('-')}-****`;
    }
  }

  // Short identity: show first chars + ellipsis
  if (identity.length > 12) {
    return `${identity.slice(0, 8)}...`;
  }

  return identity;
}

export default function MaskedIdentity({ identity, revealTimeout = 10000, className = '' }: Props) {
  const [revealed, setRevealed] = useState(false);

  const toggle = useCallback(() => setRevealed(r => !r), []);

  // Auto-hide after timeout
  useEffect(() => {
    if (revealed && revealTimeout > 0) {
      const timer = setTimeout(() => setRevealed(false), revealTimeout);
      return () => clearTimeout(timer);
    }
  }, [revealed, revealTimeout]);

  const display = revealed ? identity : maskIdentity(identity);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={`${revealed ? 'text-slate-800' : 'text-slate-600'}`} title={revealed ? identity : 'Click eye to reveal'}>
        {display}
      </span>
      <button
        onClick={toggle}
        className="p-0.5 rounded hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-label={revealed ? 'Hide identity' : 'Reveal identity'}
        title={revealed ? 'Hide identity' : 'Reveal identity'}
      >
        {revealed ? (
          // Eye-off icon
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          // Eye icon
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </span>
  );
}

/** Export the mask function for use elsewhere (e.g., exports, logs). */
export { maskIdentity };
