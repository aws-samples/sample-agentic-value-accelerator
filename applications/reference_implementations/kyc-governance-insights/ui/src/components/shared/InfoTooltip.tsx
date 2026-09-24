import { useState, useRef, useCallback, useEffect } from 'react';

interface InfoTooltipProps {
  text: string;
}

/**
 * Small (ℹ️) icon that shows a tooltip on hover (1s delay).
 * Position-aware: renders above if room, below otherwise.
 * Tap on mobile shows tooltip.
 */
export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<'above' | 'below'>('above');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const startShow = useCallback(() => {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    timer.current = setTimeout(() => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setPos(rect.top > 100 ? 'above' : 'below');
      }
      setShow(true);
    }, 1000);
  }, []);

  const startDismiss = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    dismissTimer.current = setTimeout(() => setShow(false), 300);
  }, []);

  const cancelDismiss = useCallback(() => {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
  }, []);

  const handleClick = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos(rect.top > 100 ? 'above' : 'below');
    }
    setShow(s => !s);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '4px' }}
      onMouseEnter={startShow}
      onMouseLeave={startDismiss}
      onClick={handleClick}
    >
      <span style={{ fontSize: '11px', cursor: 'help', opacity: 0.5, color: 'var(--text-muted)' }}>ℹ️</span>
      {show && (
        <div
          onMouseEnter={cancelDismiss}
          onMouseLeave={startDismiss}
          style={{
            position: 'absolute',
            [pos === 'above' ? 'bottom' : 'top']: '110%',
            left: '50%', transform: 'translateX(-50%)',
            background: '#1a1a2e', color: '#e0e0e0',
            padding: '10px 12px', borderRadius: '8px',
            fontSize: '11px', lineHeight: 1.6, maxWidth: '280px', width: 'max-content',
            whiteSpace: 'normal', wordWrap: 'break-word',
            zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            animation: 'fadeIn 0.2s ease', pointerEvents: 'auto',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
