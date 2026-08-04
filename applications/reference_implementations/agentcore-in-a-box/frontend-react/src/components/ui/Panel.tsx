import * as React from 'react';
import { cn } from '../../lib/cn';
import { Card } from './Card';

interface PanelProps {
  /** Dotted field-key title, e.g. "positions.allocation" (rendered mono/uppercase). */
  title?: React.ReactNode;
  /** Optional right-aligned slot — a unit hint, count, or control. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Tighter header/body padding for dense tiles. */
  dense?: boolean;
}

/**
 * "Data-dense technical" tile. Wraps an elevated Card and standardizes the bento
 * chrome: a dotted field-key header with an optional unit/action slot, plus a
 * `flex-1 min-h-0` body so a child chart `ResponsiveContainer height="100%"`
 * resolves to a real pixel height.
 */
export function Panel({ title, action, children, className, dense }: PanelProps) {
  return (
    <Card variant="elevated" className={cn('flex flex-col overflow-hidden', className)}>
      {(title || action) && (
        <div
          className={cn(
            'flex items-center justify-between shrink-0',
            dense ? 'px-3 pt-2 pb-1' : 'px-4 pt-3 pb-1.5',
          )}
        >
          {title && <span className="field-key truncate">{title}</span>}
          {action && <span className="field-key text-muted-foreground/80 shrink-0 ml-2">{action}</span>}
        </div>
      )}
      <div className={cn('flex-1 min-h-0', dense ? 'px-3 pb-2.5' : 'px-4 pb-3.5')}>{children}</div>
    </Card>
  );
}
