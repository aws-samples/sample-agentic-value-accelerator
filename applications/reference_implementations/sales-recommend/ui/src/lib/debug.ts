/**
 * Lightweight client-side debug logger.
 *
 * Active by default in `next dev` (NODE_ENV !== "production") and silent
 * in production builds. You can also force it on/off explicitly with
 * `NEXT_PUBLIC_DEBUG_AGENT=1` or `=0` in `.env.local`.
 *
 * Usage:
 *   import { dbg } from "@/lib/debug";
 *   dbg.log("hello", someObject);
 *   dbg.group("agent reply", () => { dbg.log("..."); });
 */
const PREFIX = "%c[meridian]";
const STYLE = "color:#10b981; font-weight:600;";

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  const flag = process.env.NEXT_PUBLIC_DEBUG_AGENT;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export const dbg = {
  log(label: string, ...rest: unknown[]) {
    if (!enabled()) return;
    if (rest.length) console.log(PREFIX, STYLE, label, ...rest);
    else console.log(PREFIX, STYLE, label);
  },
  warn(label: string, ...rest: unknown[]) {
    if (!enabled()) return;
    console.warn(PREFIX, STYLE, label, ...rest);
  },
  group(label: string, body: () => void) {
    if (!enabled()) {
      body();
      return;
    }
    console.groupCollapsed(PREFIX, STYLE, label);
    try {
      body();
    } finally {
      console.groupEnd();
    }
  },
  /** Log the full string verbatim (no truncation) inside a collapsed group. */
  text(label: string, body: string) {
    if (!enabled()) return;
    console.groupCollapsed(PREFIX, STYLE, `${label} (${body.length} chars)`);
    console.log(body);
    console.groupEnd();
  },
};
