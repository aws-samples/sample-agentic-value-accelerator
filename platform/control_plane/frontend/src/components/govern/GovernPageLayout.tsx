/**
 * GovernPageLayout — Reusable page layout for Govern module pages
 *
 * Standardizes the header pattern with:
 * - Back navigation link
 * - Title with optional badge
 * - Optional description
 * - Optional action buttons
 * - Consistent spacing and styling
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DataSourceStatus from './DataSourceStatus';

interface GovernPageLayoutProps {
  /** Page title */
  title: string;
  /** Optional description text below the title */
  description?: string;
  /** Optional badge component (e.g., "Live", "Demo", MockDataBadge) */
  badge?: ReactNode;
  /** Optional action buttons/links displayed in the top right */
  actions?: ReactNode;
  /** Back navigation path (defaults to "/govern") */
  backPath?: string;
  /** Back navigation label (defaults to "Govern") */
  backLabel?: string;
  /** Page content */
  children: ReactNode;
  /** Optional additional className for the content container */
  className?: string;
}

/**
 * GovernPageLayout provides a consistent page structure for all Govern module pages.
 *
 * @example
 * ```tsx
 * <GovernPageLayout
 *   title="Risk Management"
 *   description="Enterprise risk register, assessments, controls, and issue tracking."
 *   badge={<MockDataBadge integration="Custom PostgreSQL/DynamoDB backend" />}
 *   actions={<Link to="/govern/risk">View Risk Controls</Link>}
 * >
 *   {pageContent}
 * </GovernPageLayout>
 * ```
 *
 * @example With custom back navigation
 * ```tsx
 * <GovernPageLayout
 *   title="Data Quality"
 *   backPath="/govern/data"
 *   backLabel="Data Governance"
 * >
 *   {pageContent}
 * </GovernPageLayout>
 * ```
 */
export default function GovernPageLayout({
  title,
  description,
  badge,
  actions,
  backPath = '/govern',
  backLabel = 'Govern',
  children,
  className,
}: GovernPageLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className={`relative max-w-7xl mx-auto px-6 py-10 ${className || ''}`}>
        {/* Back navigation */}
        <Link
          to={backPath}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
        >
          ← {backLabel}
        </Link>

        {/* Header section */}
        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
                {title}
              </h1>
              {badge}
            </div>
            {description && (
              <p className="text-slate-500 mt-1 max-w-2xl">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <DataSourceStatus compact />
            {actions}
          </div>
        </div>

        {/* Page content */}
        {children}
      </div>
    </div>
  );
}
