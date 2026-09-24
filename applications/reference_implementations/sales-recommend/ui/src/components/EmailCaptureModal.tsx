"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useUser } from "@/components/UserProvider";
import {
  isValidEmail,
  markPromptDismissed,
  wasPromptDismissed,
} from "@/lib/userIdentity";

/**
 * EmailCaptureModal
 *
 * A soft-gate that invites the visitor to share their email so we know who is
 * trying the demo. It is intentionally low-friction to complete and, per
 * product direction, the "skip" affordance is deliberately understated so that
 * most visitors share an email — while still being fully dismissable (subtle
 * text link + Escape key) so no one is trapped.
 *
 * Shows when: the client has hydrated, no email is stored, and the visitor
 * hasn't dismissed the prompt this session.
 */
export function EmailCaptureModal() {
  const { email, hydrated, setEmail } = useUser();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Decide whether to show once client state is known.
  useEffect(() => {
    if (!hydrated) return;
    if (!email && !wasPromptDismissed()) setVisible(true);
  }, [hydrated, email]);

  // Focus the input and wire Escape-to-dismiss while open.
  useEffect(() => {
    if (!visible) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    markPromptDismissed();
    setVisible(false);
  }

  async function share() {
    const candidate = value.trim();
    if (!isValidEmail(candidate)) {
      setError("Please enter a valid email address.");
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);

    // Persist locally first so the UI updates instantly and the prompt won't
    // reappear — then best-effort report it server-side. A failed report must
    // never block the visitor.
    setEmail(candidate);
    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: candidate }),
        keepalive: true,
      });
    } catch {
      /* non-fatal: we already saved locally */
    }
    setSubmitting(false);
    setVisible(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void share();
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-capture-title"
    >
      {/* Backdrop — intentionally does NOT close on click, so dismissal is a
          deliberate choice rather than an accidental one. */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

      <div className="animate-fade-up relative w-full max-w-md rounded-2xl border border-ink-700/60 bg-ink-900 p-6 shadow-card">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2
              id="email-capture-title"
              className="text-base font-semibold leading-tight text-white"
            >
              We&rsquo;d like to know who you are
            </h2>
            <p className="text-xs leading-tight text-slate-400">
              Share your email so we can follow up — totally optional.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="email-capture-input" className="sr-only">
            Email address
          </label>
          <input
            id="email-capture-input"
            ref={inputRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "email-capture-error" : undefined}
            className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-accent-soft focus:ring-1 focus:ring-accent-soft"
          />
          {error && (
            <p id="email-capture-error" className="mt-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-deep px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Sharing…" : "Share my email"}
          </button>
        </form>

        {/* Deliberately understated dismiss — small, low-contrast, no icon. */}
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-slate-600 underline-offset-2 transition-colors hover:text-slate-500 hover:underline"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
