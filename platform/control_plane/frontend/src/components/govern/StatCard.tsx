/**
 * StatCard — Reusable KPI/stat display component for Govern module
 *
 * Consolidates the common pattern of displaying:
 * - Label (small uppercase text)
 * - Value (large number or text)
 * - Optional trend indicator (+12%, -5%, etc.)
 * - Optional sub-text for additional context
 * - Color variants for visual meaning
 * - Optional icon
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type StatCardVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
export type TrendDirection = 'up' | 'down' | 'flat';

interface StatCardProps {
  /** Small uppercase label above the value */
  label: string;
  /** Main value to display (number, string, or formatted element) */
  value: ReactNode;
  /** Optional sub-text below the value for additional context */
  sub?: ReactNode;
  /** Trend indicator (+12%, -5%, etc.) */
  trend?: {
    value: string;
    direction: TrendDirection;
    /** Whether trend direction is good (up=good for growth, down=good for costs) */
    isPositive?: boolean;
  };
  /** Color variant for the card */
  variant?: StatCardVariant;
  /** Optional icon element to display */
  icon?: ReactNode;
  /** Optional link to make the card clickable */
  href?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const variantStyles: Record<StatCardVariant, {
  border: string;
  label: string;
  value: string;
  bg: string;
}> = {
  default: {
    border: 'border-slate-200/60',
    label: 'text-slate-500',
    value: 'text-slate-900',
    bg: 'bg-white/80',
  },
  success: {
    border: 'border-emerald-200',
    label: 'text-emerald-600',
    value: 'text-emerald-700',
    bg: 'bg-white/80',
  },
  warning: {
    border: 'border-amber-200',
    label: 'text-amber-600',
    value: 'text-amber-700',
    bg: 'bg-white/80',
  },
  danger: {
    border: 'border-rose-200',
    label: 'text-rose-600',
    value: 'text-rose-700',
    bg: 'bg-white/80',
  },
  info: {
    border: 'border-blue-200',
    label: 'text-blue-600',
    value: 'text-blue-700',
    bg: 'bg-white/80',
  },
  muted: {
    border: 'border-slate-200/60',
    label: 'text-slate-400',
    value: 'text-slate-600',
    bg: 'bg-slate-50/80',
  },
};

const sizeStyles: Record<'sm' | 'md' | 'lg', {
  padding: string;
  labelSize: string;
  valueSize: string;
  subSize: string;
}> = {
  sm: {
    padding: 'p-3',
    labelSize: 'text-[9px]',
    valueSize: 'text-xl',
    subSize: 'text-[10px]',
  },
  md: {
    padding: 'p-4',
    labelSize: 'text-[10px]',
    valueSize: 'text-2xl',
    subSize: 'text-xs',
  },
  lg: {
    padding: 'p-5',
    labelSize: 'text-[11px]',
    valueSize: 'text-3xl',
    subSize: 'text-xs',
  },
};

const trendArrows: Record<TrendDirection, string> = {
  up: '▲',   // ▲
  down: '▼', // ▼
  flat: '▸', // ▸
};

function getTrendColor(direction: TrendDirection, isPositive?: boolean): string {
  if (direction === 'flat') return 'text-slate-400';

  // If isPositive is explicitly set, use that to determine color
  if (isPositive !== undefined) {
    return isPositive ? 'text-emerald-600' : 'text-rose-600';
  }

  // Default: up is bad (rising costs/risks), down is good (decreasing)
  return direction === 'up' ? 'text-rose-600' : 'text-emerald-600';
}

export default function StatCard({
  label,
  value,
  sub,
  trend,
  variant = 'default',
  icon,
  href,
  size = 'md',
  className = '',
}: StatCardProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  const content = (
    <>
      {/* Header row with label and optional icon */}
      <div className="flex items-center justify-between">
        <div className={`${s.labelSize} font-medium ${v.label} uppercase tracking-wide`}>
          {label}
        </div>
        {icon && (
          <div className="flex-shrink-0">{icon}</div>
        )}
      </div>

      {/* Main value */}
      <div className={`${s.valueSize} font-semibold ${v.value} mt-1`}>
        {value}
      </div>

      {/* Sub text and trend */}
      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-1">
          {sub && (
            <div className={`${s.subSize} text-slate-400`}>{sub}</div>
          )}
          {trend && (
            <div className={`${s.subSize} font-semibold ${getTrendColor(trend.direction, trend.isPositive)}`}>
              {trendArrows[trend.direction]} {trend.value}
            </div>
          )}
        </div>
      )}
    </>
  );

  const cardClasses = `
    ${v.bg} backdrop-blur-sm rounded-xl border ${v.border} ${s.padding} shadow-sm
    ${href ? 'hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  if (href) {
    // Use Link for internal routes, <a> for external
    if (href.startsWith('/')) {
      return (
        <Link to={href} className={cardClasses}>
          {content}
        </Link>
      );
    }
    return (
      <a href={href} className={cardClasses}>
        {content}
      </a>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}

/**
 * StatCardGrid — Helper component for consistent grid layouts
 */
interface StatCardGridProps {
  children: ReactNode;
  /** Number of columns at different breakpoints */
  cols?: {
    base?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
  className?: string;
}

export function StatCardGrid({
  children,
  cols = { base: 2, md: 4, lg: 6 },
  className = '',
}: StatCardGridProps) {
  const gridCols = [
    cols.base && `grid-cols-${cols.base}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
  ].filter(Boolean).join(' ');

  return (
    <div className={`grid ${gridCols} gap-4 ${className}`}>
      {children}
    </div>
  );
}

/**
 * MiniStatCard — Compact variant for inline displays
 */
interface MiniStatCardProps {
  label: string;
  value: ReactNode;
  variant?: StatCardVariant;
  className?: string;
}

export function MiniStatCard({
  label,
  value,
  variant = 'default',
  className = '',
}: MiniStatCardProps) {
  const v = variantStyles[variant];

  return (
    <div className={`p-2 rounded-lg ${v.bg} border ${v.border} text-center ${className}`}>
      <div className={`text-lg font-bold ${v.value}`}>{value}</div>
      <div className="text-[9px] text-slate-500">{label}</div>
    </div>
  );
}
