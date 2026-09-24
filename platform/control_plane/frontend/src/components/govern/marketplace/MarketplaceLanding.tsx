/**
 * MarketplaceLanding - Consumer-facing catalog for discovering and subscribing to AI resources.
 *
 * Features:
 * - Browse available agents, MCP servers, knowledge bases, etc.
 * - Search and filter by type, category, tags
 * - Subscribe/request access to resources
 * - View subscription status
 *
 * This is the primary entry point for end users (not just operators) to discover
 * governed AI resources within the organization.
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  governMarketplaceApi,
  type CatalogItem,
  type CatalogResponse,
  type CatalogItemDetailResponse,
  type MySubscriptionsResponse,
  type ResourceType,
  type Subscription,
  type SubscriptionStatus,
  type RiskLevel,
} from '../../../api/client';
import GovernPageLayout from '../GovernPageLayout';
import GovernTabs, { type GovernTab } from '../GovernTabs';
import { Icon, type IconName } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

type TabId = 'browse' | 'my-subscriptions';

const TABS: GovernTab[] = [
  { id: 'browse', label: 'Browse Catalog' },
  { id: 'my-subscriptions', label: 'My Subscriptions' },
];

const RESOURCE_TYPE_LABELS: Record<ResourceType, { label: string; icon: IconName; color: string }> = {
  agent: { label: 'Agent', icon: 'cpu-chip', color: 'text-indigo-600 bg-indigo-50' },
  mcp_server: { label: 'MCP Server', icon: 'server-stack', color: 'text-purple-600 bg-purple-50' },
  a2a_agent: { label: 'A2A Agent', icon: 'arrows-right-left', color: 'text-cyan-600 bg-cyan-50' },
  knowledge_base: { label: 'Knowledge Base', icon: 'book-open', color: 'text-emerald-600 bg-emerald-50' },
  skill: { label: 'Skill', icon: 'sparkles', color: 'text-amber-600 bg-amber-50' },
  harness: { label: 'Harness', icon: 'wrench-screwdriver', color: 'text-slate-600 bg-slate-50' },
  model: { label: 'Model', icon: 'cube', color: 'text-rose-600 bg-rose-50' },
};

const SUBSCRIPTION_STATUS_STYLES: Record<SubscriptionStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  active: { label: 'Subscribed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  revoked: { label: 'Revoked', className: 'bg-red-50 text-red-700 border-red-200' },
  expired: { label: 'Expired', className: 'bg-slate-50 text-slate-500 border-slate-200' },
  denied: { label: 'Denied', className: 'bg-red-50 text-red-700 border-red-200' },
};

const RISK_LEVEL_STYLES: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: 'Low Risk', className: 'bg-emerald-50 text-emerald-700' },
  medium: { label: 'Medium Risk', className: 'bg-amber-50 text-amber-700' },
  high: { label: 'High Risk', className: 'bg-orange-50 text-orange-700' },
  critical: { label: 'Critical Risk', className: 'bg-red-50 text-red-700' },
};

function ResourceTypeBadge({ type }: { type: ResourceType }) {
  const config = RESOURCE_TYPE_LABELS[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon name={config.icon} className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const config = SUBSCRIPTION_STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

function CatalogCard({
  item,
  onSubscribe,
  onViewDetails,
}: {
  item: CatalogItem;
  onSubscribe: (item: CatalogItem) => void;
  onViewDetails: (item: CatalogItem) => void;
}) {
  const hasSubscription = !!item.user_subscription_status;
  const isActive = item.user_subscription_status === 'active';
  const isPending = item.user_subscription_status === 'pending';

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <ResourceTypeBadge type={item.resource_type} />
          {item.featured && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
              <Icon name="sparkles" className="w-3 h-3 mr-0.5" />
              Featured
            </span>
          )}
        </div>
        {hasSubscription && <SubscriptionStatusBadge status={item.user_subscription_status!} />}
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-1">{item.name}</h3>
      <p className="text-sm text-slate-600 mb-3 line-clamp-2">{item.description}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {item.tags.slice(0, 3).map(tag => (
          <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
            {tag}
          </span>
        ))}
        {item.tags.length > 3 && (
          <span className="px-2 py-0.5 text-slate-400 text-xs">+{item.tags.length - 3}</span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
        <span>
          <Icon name="users" className="w-3.5 h-3.5 inline mr-1" />
          {item.subscriber_count} subscribers
        </span>
        <span className="capitalize">{item.category}</span>
      </div>

      {item.estimated_cost_per_1k !== null && item.estimated_cost_per_1k !== undefined && (
        <div className="text-xs text-slate-500 mb-3">
          <Icon name="currency-dollar" className="w-3.5 h-3.5 inline mr-1" />
          ~${item.estimated_cost_per_1k.toFixed(2)}/1K invocations
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onViewDetails(item)}
          className="flex-1 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
        >
          View Details
        </button>
        {!isActive && !isPending && (
          <button
            onClick={() => onSubscribe(item)}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
          >
            {item.approval_mode === 'auto_approve' ? 'Subscribe' : 'Request Access'}
          </button>
        )}
        {isPending && (
          <button disabled className="flex-1 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded cursor-not-allowed">
            Pending Approval
          </button>
        )}
        {isActive && (
          <Link
            to={`/aaas/marketplace?tab=my-subscriptions&highlight=${item.user_subscription_id}`}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
          >
            Manage
          </Link>
        )}
      </div>
    </div>
  );
}

function SubscribeModal({
  item,
  onClose,
  onSubmit,
}: {
  item: CatalogItem;
  onClose: () => void;
  onSubmit: (data: { business_unit: string; cost_center: string; justification: string }) => void;
}) {
  const [businessUnit, setBusinessUnit] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ business_unit: businessUnit, cost_center: costCenter, justification });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {item.approval_mode === 'auto_approve' ? 'Subscribe to' : 'Request Access to'} {item.name}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business Unit *</label>
              <input
                type="text"
                value={businessUnit}
                onChange={e => setBusinessUnit(e.target.value)}
                required
                placeholder="e.g., Retail Banking"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cost Center *</label>
              <input
                type="text"
                value={costCenter}
                onChange={e => setCostCenter(e.target.value)}
                required
                placeholder="e.g., CC-1001"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">Usage costs will be attributed to this cost center</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Justification {item.approval_mode !== 'auto_approve' && '*'}
              </label>
              <textarea
                value={justification}
                onChange={e => setJustification(e.target.value)}
                required={item.approval_mode !== 'auto_approve'}
                placeholder="Describe your use case..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {item.approval_mode !== 'auto_approve' && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-amber-800 text-sm">
                  <Icon name="clock" className="w-4 h-4" />
                  <span>This resource requires approval. You'll be notified when approved.</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !businessUnit || !costCenter}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-md transition-colors"
            >
              {submitting ? 'Submitting...' : item.approval_mode === 'auto_approve' ? 'Subscribe' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CatalogDetailDrawer({
  itemId,
  onClose,
  onSubscribe,
}: {
  itemId: string;
  onClose: () => void;
  onSubscribe: (item: CatalogItem) => void;
}) {
  const [detail, setDetail] = useState<CatalogItemDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDetail();
  }, [itemId]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governMarketplaceApi.getCatalogItem(itemId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  const item = detail?.item;
  const hasSubscription = !!item?.user_subscription_status;
  const isActive = item?.user_subscription_status === 'active';
  const isPending = item?.user_subscription_status === 'pending';

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium"
            >
              <Icon name="arrow-left" className="w-5 h-5" />
              Back to Catalog
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <Icon name="x-mark" className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-2">Resource Details</h2>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
              {error}
            </div>
          </div>
        )}

        {!loading && !error && item && (
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ResourceTypeBadge type={item.resource_type} />
                {item.featured && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
                    <Icon name="sparkles" className="w-3 h-3 mr-0.5" />
                    Featured
                  </span>
                )}
                {hasSubscription && <SubscriptionStatusBadge status={item.user_subscription_status!} />}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{item.name}</h3>
              <p className="text-slate-600">{detail?.full_description || item.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Owner</div>
                <div className="font-medium text-slate-900">{item.owner_team}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Category</div>
                <div className="font-medium text-slate-900 capitalize">{item.category}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Subscribers</div>
                <div className="font-medium text-slate-900">{item.subscriber_count}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Risk Level</div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RISK_LEVEL_STYLES[item.risk_level]?.className || 'bg-slate-100 text-slate-600'}`}>
                  {RISK_LEVEL_STYLES[item.risk_level]?.label || item.risk_level}
                </span>
              </div>
            </div>

            {item.estimated_cost_per_1k !== null && item.estimated_cost_per_1k !== undefined && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-indigo-900">
                  <Icon name="currency-dollar" className="w-5 h-5" />
                  <span className="font-medium">Estimated Cost</span>
                </div>
                <div className="text-2xl font-semibold text-indigo-600 mt-1">
                  ${item.estimated_cost_per_1k.toFixed(2)} <span className="text-sm font-normal text-indigo-400">per 1K invocations</span>
                </div>
                <div className="text-xs text-indigo-600 mt-1">Cost model: {item.cost_model}</div>
              </div>
            )}

            {item.capabilities && item.capabilities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Capabilities</h4>
                <div className="flex flex-wrap gap-2">
                  {item.capabilities.map(cap => (
                    <span key={cap} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail?.use_cases && detail.use_cases.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Use Cases</h4>
                <ul className="space-y-1">
                  {detail.use_cases.map((uc, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <Icon name="check" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {uc}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail?.limitations && detail.limitations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Limitations</h4>
                <ul className="space-y-1">
                  {detail.limitations.map((lim, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      {lim}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {item.tags && item.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {item.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(detail?.documentation_url || detail?.support_contact) && (
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-900 mb-2">Support</h4>
                <div className="space-y-2 text-sm">
                  {detail?.documentation_url && (
                    <a
                      href={detail.documentation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800"
                    >
                      <Icon name="document-text" className="w-4 h-4" />
                      Documentation
                      <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  )}
                  {detail?.support_contact && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Icon name="chat-bubble" className="w-4 h-4" />
                      {detail.support_contact}
                    </div>
                  )}
                </div>
              </div>
            )}

            {detail?.related_items && detail.related_items.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-900 mb-2">Related Resources</h4>
                <div className="space-y-2">
                  {detail.related_items.slice(0, 3).map(related => (
                    <div key={related.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <ResourceTypeBadge type={related.resource_type} />
                        <span className="text-sm font-medium text-slate-900">{related.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 pt-4">
              {!isActive && !isPending && (
                <button
                  onClick={() => onSubscribe(item)}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                >
                  {item.approval_mode === 'auto_approve' ? 'Subscribe' : 'Request Access'}
                </button>
              )}
              {isPending && (
                <div className="text-center py-2 text-amber-700 bg-amber-50 rounded-md">
                  <Icon name="clock" className="w-4 h-4 inline mr-1" />
                  Access request pending approval
                </div>
              )}
              {isActive && (
                <Link
                  to={`/aaas/marketplace?tab=my-subscriptions`}
                  className="block w-full px-4 py-2 text-sm font-medium text-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                >
                  <Icon name="check-circle" className="w-4 h-4 inline mr-1" />
                  Manage Subscription
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceLanding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [tab, setTab] = useState<TabId>(tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : 'browse');

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');

  const [subscribeItem, setSubscribeItem] = useState<CatalogItem | null>(null);
  const [subscribeSuccess, setSubscribeSuccess] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog();
  }, [resourceTypeFilter, categoryFilter, search]);

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governMarketplaceApi.browseCatalog({
        page: 1,
        page_size: 50,
        resource_type: resourceTypeFilter !== 'all' ? resourceTypeFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: search || undefined,
      });
      setCatalog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (newTab: TabId) => {
    setTab(newTab);
    searchParams.set('tab', newTab);
    setSearchParams(searchParams, { replace: true });
  };

  const handleSubscribe = async (data: { business_unit: string; cost_center: string; justification: string }) => {
    if (!subscribeItem) return;
    try {
      const result = await governMarketplaceApi.requestSubscription({
        listing_id: subscribeItem.id,
        ...data,
      });
      setSubscribeItem(null);
      setSubscribeSuccess(
        result.subscription.status === 'active'
          ? `Successfully subscribed to ${subscribeItem.name}!`
          : `Access request submitted for ${subscribeItem.name}. You'll be notified when approved.`
      );
      loadCatalog();
      setTimeout(() => setSubscribeSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit subscription request');
    }
  };

  const handleViewDetails = (item: CatalogItem) => {
    setDetailItemId(item.id);
  };

  return (
    <GovernPageLayout
      title="Marketplace"
      description="Discover and subscribe to governed AI resources"
    >
      <GovernTabs
        tabs={TABS}
        activeTab={tab}
        onTabChange={id => handleTabChange(id as TabId)}
      />

      {subscribeSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800">
          <Icon name="check-circle" className="w-5 h-5" />
          {subscribeSuccess}
        </div>
      )}

      {tab === 'browse' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
                <div className="relative">
                  <Icon name="magnifying-glass" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search resources..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="w-48">
                <label className="block text-xs font-medium text-slate-500 mb-1">Resource Type</label>
                <select
                  value={resourceTypeFilter}
                  onChange={e => setResourceTypeFilter(e.target.value as ResourceType | 'all')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">All Types</option>
                  {Object.entries(RESOURCE_TYPE_LABELS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="w-48">
                <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">All Categories</option>
                  {catalog?.categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Loading/Error states */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
              {error}
            </div>
          )}

          {/* Catalog grid */}
          {!loading && !error && catalog && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  {catalog.total} resources available
                  {catalog.live ? <span className="ml-2"><LiveDataBadge /></span> : <span className="ml-2"><MockDataBadge /></span>}
                </div>
              </div>

              {catalog.items.length === 0 ? (
                <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
                  <Icon name="inbox-stack" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No resources found matching your filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catalog.items.map(item => (
                    <CatalogCard
                      key={item.id}
                      item={item}
                      onSubscribe={setSubscribeItem}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'my-subscriptions' && (
        <MySubscriptionsTab />
      )}

      {/* Subscribe Modal */}
      {subscribeItem && (
        <SubscribeModal
          item={subscribeItem}
          onClose={() => setSubscribeItem(null)}
          onSubmit={handleSubscribe}
        />
      )}

      {/* Detail Drawer */}
      {detailItemId && (
        <CatalogDetailDrawer
          itemId={detailItemId}
          onClose={() => setDetailItemId(null)}
          onSubscribe={(item) => {
            setDetailItemId(null);
            setSubscribeItem(item);
          }}
        />
      )}
    </GovernPageLayout>
  );
}

function MySubscriptionsTab() {
  const [subscriptions, setSubscriptions] = useState<MySubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribeId, setUnsubscribeId] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const data = await governMarketplaceApi.getMySubscriptions();
      setSubscriptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!unsubscribeId) return;
    try {
      await governMarketplaceApi.unsubscribe(unsubscribeId);
      setUnsubscribeId(null);
      loadSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
        {error}
      </div>
    );
  }

  if (!subscriptions?.subscriptions?.length) {
    return (
      <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
        <Icon name="inbox-stack" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 mb-4">You don't have any subscriptions yet</p>
        <Link
          to="/aaas/marketplace?tab=browse"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
        >
          Browse Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-1">Active Subscriptions</div>
          <div className="text-2xl font-semibold text-emerald-600">{subscriptions.active_count}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-1">Pending Requests</div>
          <div className="text-2xl font-semibold text-amber-600">{subscriptions.pending_count}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-1">30-Day Cost</div>
          <div className="text-2xl font-semibold text-slate-900">${subscriptions.total_cost_30d.toFixed(2)}</div>
        </div>
      </div>

      {/* Subscriptions list */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Resource</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cost Center</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Usage (30d)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cost (30d)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {subscriptions.subscriptions.map((sub: Subscription) => (
              <tr key={sub.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{sub.listing_name || sub.listing_id}</div>
                  <div className="text-xs text-slate-500">{sub.business_unit}</div>
                </td>
                <td className="px-4 py-3">
                  {sub.resource_type && <ResourceTypeBadge type={sub.resource_type} />}
                </td>
                <td className="px-4 py-3">
                  <SubscriptionStatusBadge status={sub.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{sub.cost_center}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {sub.usage?.invocations_30d?.toLocaleString() || 0} invocations
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  ${sub.usage?.cost_30d?.toFixed(2) || '0.00'}
                </td>
                <td className="px-4 py-3 text-right">
                  {sub.status === 'active' && (
                    <button
                      onClick={() => setUnsubscribeId(sub.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Unsubscribe
                    </button>
                  )}
                  {sub.status === 'pending' && (
                    <span className="text-sm text-slate-400">Awaiting approval</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unsubscribe Confirmation Modal */}
      {unsubscribeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirm Unsubscribe</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to unsubscribe from this resource? You will lose access immediately.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setUnsubscribeId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleUnsubscribe}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
              >
                Unsubscribe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
