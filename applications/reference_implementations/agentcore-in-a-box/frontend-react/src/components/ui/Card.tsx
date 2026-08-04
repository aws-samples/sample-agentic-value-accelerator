import * as React from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 'default' — flat card (border + bg).
   * 'elevated' — bento-tile surface: crisp border + inset hairline ring + faint
   * shadow (see `.panel-elevated` in styles.css).
   */
  variant?: 'default' | 'elevated';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'text-card-foreground',
        variant === 'elevated' ? 'panel-elevated' : 'rounded-xl border border-border bg-card',
        className,
      )}
      {...props}  // nosemgrep  (react-props-spreading: typed forwardRef passthrough)
    />
  ),
);
Card.displayName = 'Card';
