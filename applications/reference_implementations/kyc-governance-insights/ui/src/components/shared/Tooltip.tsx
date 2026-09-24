import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode, CSSProperties } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Shared tooltip component. Hover the child element for 1s to show tooltip.
 * Click also shows immediately (mobile/accessibility).
 * Tooltip stays visible while mouse is over EITHER child OR tooltip.
 * Dismisses 300ms after mouse leaves both.
 * Max-width 320px, no truncation, prefers above, flips below if needed.
 */
export default function Tooltip({ text, children, style }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<'above' | 'below'>('above');
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const startShow = useCallback(() => {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    if (show) return;
    hoverTimer.current = setTimeout(() => {
      // Check position
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        setPosition(rect.top > 120 ? 'above' : 'below');
      }
      setShow(true);
    }, 1000);
  }, [show]);

  const startDismiss = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    dismissTimer.current = setTimeout(() => setShow(false), 300);
  }, []);

  const cancelDismiss = useCallback(() => {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
  }, []);

  const handleClick = useCallback(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setPosition(rect.top > 120 ? 'above' : 'below');
    }
    setShow((s) => !s);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  return (
    <span
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}
      onMouseEnter={startShow}
      onMouseLeave={startDismiss}
      onClick={handleClick}
    >
      {children}
      {show && (
        <div
          onMouseEnter={cancelDismiss}
          onMouseLeave={startDismiss}
          style={{
            position: 'absolute',
            [position === 'above' ? 'bottom' : 'top']: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a2e',
            color: '#e0e0e0',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            lineHeight: '1.6',
            maxWidth: '320px',
            width: 'max-content',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            animation: 'fadeIn 0.2s ease',
            pointerEvents: 'auto',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
