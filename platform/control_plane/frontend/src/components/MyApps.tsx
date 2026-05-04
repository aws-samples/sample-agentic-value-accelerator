import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment } from '../types';
import LoadingSpinner from './LoadingSpinner';

/**
 * My Apps — a business-user-facing view of app-factory deployments only.
 *
 * Filters the full deployments list to `template_id` starting with
 * `app-factory-` AND `status === 'deployed'`. Edit is marked as coming soon;
 * the UI link opens the generated app in a new tab.
 */
export default function MyApps() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await deploymentsApi.list();
        if (cancelled) return;
        const apps = all
          .filter(
            (d) =>
              (d.template_id || '').startsWith('app-factory-') &&
              d.status === 'deployed'
          )
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        setDeployments(apps);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8 animate-fade-in">
        <Link to="/applications" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Applications</Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">My Apps</h1>
        <p className="text-slate-500 mt-2 max-w-2xl">
          Generated and deployed through the App Factory. Open an app, jump to
          its full deployment detail, or re-edit the use case (coming soon).
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card bg-red-50/80 border-red-200/60">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && deployments.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <svg
            className="w-12 h-12 text-slate-300 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          </svg>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            No apps yet
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mb-5">
            Click <span className="font-semibold">App Factory</span> in the
            sidebar to create your first deployment.
          </p>
          <button
            onClick={() => navigate('/applications/app-factory')}
            className="inline-flex items-center gap-1.5 text-sm py-2 px-4 rounded-lg font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors"
          >
            Go to App Factory
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        </div>
      )}

      {!loading && !error && deployments.length > 0 && (
        <div className="grid gap-4">
          {deployments.map((d) => {
            const uiUrl =
              d.outputs?.ui_url ||
              d.outputs?.app_url ||
              d.outputs?.AmplifyUrl ||
              '';
            return (
              <div
                key={d.deployment_id}
                className="card hover:shadow-lg transition-shadow duration-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {d.deployment_name}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Deployed from{' '}
                      <span className="font-semibold text-slate-700">
                        {d.template_id}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      Region {d.aws_region} ·{' '}
                      {new Date(d.created_at).toLocaleString(undefined, {
                        timeZoneName: 'short',
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {uiUrl && (
                      <button
                        onClick={() => window.open(uiUrl, '_blank')}
                        className="inline-flex items-center gap-1.5 text-sm py-2 px-4 rounded-lg font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                      >
                        Open App
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/deployments/${d.deployment_id}`)}
                      className="inline-flex items-center gap-1.5 text-sm py-2 px-4 rounded-lg font-medium bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                    >
                      View details
                    </button>
                    <button
                      disabled
                      title="Coming soon: edit and re-deploy the generated use case"
                      className="inline-flex items-center gap-1.5 text-sm py-2 px-4 rounded-lg font-medium bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed opacity-70"
                    >
                      Edit (coming soon)
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
