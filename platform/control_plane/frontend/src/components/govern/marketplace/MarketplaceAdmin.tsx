/**
 * MarketplaceAdmin - Admin view for managing marketplace listings and subscriptions.
 *
 * Features:
 * - Create/edit/publish/deprecate listings
 * - Review and approve/deny subscription requests
 * - View usage analytics across all subscriptions
 *
 * This is the operator view for managing the marketplace.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  governMarketplaceApi,
  type MarketplaceListing,
  type ListingsResponse,
  type PendingApprovalsResponse,
  type AdminSubscriptionsResponse,
  type UsageAnalyticsResponse,
  type ListingStatus,
  type ResourceType,
  type ApprovalMode,
  type RiskLevel,
  type ListingVisibility,
  type SubscriptionStatus,
} from '../../../api/client';
import GovernPageLayout from '../GovernPageLayout';
import GovernTabs, { type GovernTab } from '../GovernTabs';
import { Icon } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { useUser } from '../../../contexts/UserContext';

const APPROVAL_MODE_OPTIONS: { value: ApprovalMode; label: string; description: string }[] = [
  { value: 'auto_approve', label: 'Auto Approve', description: 'Subscriptions are granted immediately' },
  { value: 'require_approval', label: 'Require Approval', description: 'Subscriptions need manual approval' },
  { value: 'deny', label: 'Deny All', description: 'No new subscriptions allowed' },
];

const RISK_LEVEL_OPTIONS: { value: RiskLevel; label: string; className: string }[] = [
  { value: 'low', label: 'Low', className: 'bg-emerald-50 text-emerald-700' },
  { value: 'medium', label: 'Medium', className: 'bg-amber-50 text-amber-700' },
  { value: 'high', label: 'High', className: 'bg-orange-50 text-orange-700' },
  { value: 'critical', label: 'Critical', className: 'bg-red-50 text-red-700' },
];

const VISIBILITY_OPTIONS: { value: ListingVisibility; label: string; description: string }[] = [
  { value: 'internal', label: 'Internal', description: 'Available to all internal users' },
  { value: 'team', label: 'Team Only', description: 'Restricted to specific teams' },
  { value: 'restricted', label: 'Restricted', description: 'Requires explicit access grant' },
];

const CATEGORY_OPTIONS = [
  'customer-service',
  'analytics',
  'automation',
  'compliance',
  'security',
  'productivity',
  'research',
  'operations',
  'other',
];

type TabId = 'listings' | 'subscriptions' | 'approvals' | 'analytics';

const TABS: GovernTab[] = [
  { id: 'listings', label: 'Manage Listings' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'approvals', label: 'Pending Approvals' },
  { id: 'analytics', label: 'Usage Analytics' },
];

const SUBSCRIPTION_STATUS_STYLES: Record<SubscriptionStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  revoked: { label: 'Revoked', className: 'bg-red-50 text-red-700' },
  expired: { label: 'Expired', className: 'bg-slate-100 text-slate-500' },
  denied: { label: 'Denied', className: 'bg-slate-100 text-slate-600' },
};

const STATUS_STYLES: Record<ListingStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700' },
  deprecated: { label: 'Deprecated', className: 'bg-amber-50 text-amber-700' },
  archived: { label: 'Archived', className: 'bg-slate-100 text-slate-500' },
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  agent: 'Agent',
  mcp_server: 'MCP Server',
  a2a_agent: 'A2A Agent',
  knowledge_base: 'Knowledge Base',
  skill: 'Skill',
  harness: 'Harness',
  model: 'Model',
};

function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const config = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

interface CreateListingModalProps {
  onClose: () => void;
  onCreated: () => void;
}

interface EditListingModalProps {
  listing: MarketplaceListing;
  onClose: () => void;
  onUpdated: () => void;
}

function EditListingModal({ listing, onClose, onUpdated }: EditListingModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(listing.name);
  const [description, setDescription] = useState(listing.description);
  const [resourceType, setResourceType] = useState<ResourceType>(listing.resource_type);
  const [resourceId, setResourceId] = useState(listing.resource_id);
  const [ownerTeam, setOwnerTeam] = useState(listing.owner_team);
  const [category, setCategory] = useState(listing.category);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(listing.approval_mode);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(listing.risk_level);
  const [visibility, setVisibility] = useState<ListingVisibility>(listing.visibility);
  const [estimatedCostPer1k, setEstimatedCostPer1k] = useState(
    listing.cost_info?.estimated_cost_per_1k?.toString() || ''
  );
  const [tags, setTags] = useState(listing.metadata?.tags?.join(', ') || '');
  const [capabilities, setCapabilities] = useState(listing.metadata?.capabilities?.join(', ') || '');
  const [useCases, setUseCases] = useState(listing.metadata?.use_cases?.join(', ') || '');
  const [limitations, setLimitations] = useState(listing.metadata?.limitations?.join(', ') || '');
  const [documentationUrl, setDocumentationUrl] = useState(listing.metadata?.documentation_url || '');
  const [supportContact, setSupportContact] = useState(listing.metadata?.support_contact || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await governMarketplaceApi.updateListing(listing.id, {
        name,
        description,
        resource_type: resourceType,
        resource_id: resourceId,
        owner_team: ownerTeam,
        category,
        approval_mode: approvalMode,
        risk_level: riskLevel,
        visibility,
        metadata: {
          capabilities: capabilities.split(',').map(s => s.trim()).filter(Boolean),
          use_cases: useCases.split(',').map(s => s.trim()).filter(Boolean),
          limitations: limitations.split(',').map(s => s.trim()).filter(Boolean),
          documentation_url: documentationUrl || undefined,
          support_contact: supportContact || undefined,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        },
        cost_info: {
          cost_model: 'per_invocation',
          estimated_cost_per_1k: estimatedCostPer1k ? parseFloat(estimatedCostPer1k) : undefined,
          cost_center_required: true,
        },
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update listing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Edit Listing</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g., Customer Service Agent"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                rows={3}
                placeholder="Brief description of what this resource does..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Resource Type *</label>
              <select
                value={resourceType}
                onChange={e => setResourceType(e.target.value as ResourceType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Object.entries(RESOURCE_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {CATEGORY_OPTIONS.map(cat => (
                  <option key={cat} value={cat}>{cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Resource ID / ARN *</label>
              <input
                type="text"
                value={resourceId}
                onChange={e => setResourceId(e.target.value)}
                required
                placeholder="e.g., arn:aws:bedrock:us-east-1:123456789:agent/abc123"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Owner Team *</label>
              <input
                type="text"
                value={ownerTeam}
                onChange={e => setOwnerTeam(e.target.value)}
                required
                placeholder="e.g., Platform Engineering"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Est. Cost per 1K Invocations</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={estimatedCostPer1k}
                  onChange={e => setEstimatedCostPer1k(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-medium text-slate-900 mb-4">Access & Risk Settings</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Approval Mode</label>
                <select
                  value={approvalMode}
                  onChange={e => setApprovalMode(e.target.value as ApprovalMode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {APPROVAL_MODE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {APPROVAL_MODE_OPTIONS.find(o => o.value === approvalMode)?.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Risk Level</label>
                <select
                  value={riskLevel}
                  onChange={e => setRiskLevel(e.target.value as RiskLevel)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {RISK_LEVEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as ListingVisibility)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {VISIBILITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-medium text-slate-900 mb-4">Metadata</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
                <input
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="comma-separated, e.g., nlp, customer-facing, production"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Capabilities</label>
                <input
                  type="text"
                  value={capabilities}
                  onChange={e => setCapabilities(e.target.value)}
                  placeholder="comma-separated, e.g., text generation, summarization, Q&A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Use Cases</label>
                <input
                  type="text"
                  value={useCases}
                  onChange={e => setUseCases(e.target.value)}
                  placeholder="comma-separated, e.g., customer support, content generation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Known Limitations</label>
                <input
                  type="text"
                  value={limitations}
                  onChange={e => setLimitations(e.target.value)}
                  placeholder="comma-separated, e.g., English only, 4K context limit"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Documentation URL</label>
                  <input
                    type="url"
                    value={documentationUrl}
                    onChange={e => setDocumentationUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Support Contact</label>
                  <input
                    type="text"
                    value={supportContact}
                    onChange={e => setSupportContact(e.target.value)}
                    placeholder="e.g., #platform-support or email"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name || !description || !resourceId || !ownerTeam}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-md transition-colors"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateListingModal({ onClose, onCreated }: CreateListingModalProps) {
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('agent');
  const [resourceId, setResourceId] = useState('');
  const [ownerTeam, setOwnerTeam] = useState('');
  const [category, setCategory] = useState('other');
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('require_approval');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [visibility, setVisibility] = useState<ListingVisibility>('internal');
  const [estimatedCostPer1k, setEstimatedCostPer1k] = useState('');
  const [tags, setTags] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [useCases, setUseCases] = useState('');
  const [limitations, setLimitations] = useState('');
  const [documentationUrl, setDocumentationUrl] = useState('');
  const [supportContact, setSupportContact] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await governMarketplaceApi.createListing({
        name,
        description,
        resource_type: resourceType,
        resource_id: resourceId,
        owner_team: ownerTeam,
        owner_email: user?.email,
        category,
        approval_mode: approvalMode,
        risk_level: riskLevel,
        visibility,
        allowed_teams: [],
        featured: false,
        metadata: {
          capabilities: capabilities.split(',').map(s => s.trim()).filter(Boolean),
          use_cases: useCases.split(',').map(s => s.trim()).filter(Boolean),
          limitations: limitations.split(',').map(s => s.trim()).filter(Boolean),
          documentation_url: documentationUrl || undefined,
          support_contact: supportContact || undefined,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        },
        cost_info: {
          cost_model: 'per_invocation',
          estimated_cost_per_1k: estimatedCostPer1k ? parseFloat(estimatedCostPer1k) : undefined,
          cost_center_required: true,
        },
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Create New Listing</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g., Customer Service Agent"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                rows={3}
                placeholder="Brief description of what this resource does..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Resource Type *</label>
              <select
                value={resourceType}
                onChange={e => setResourceType(e.target.value as ResourceType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Object.entries(RESOURCE_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {CATEGORY_OPTIONS.map(cat => (
                  <option key={cat} value={cat}>{cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Resource ID / ARN *</label>
              <input
                type="text"
                value={resourceId}
                onChange={e => setResourceId(e.target.value)}
                required
                placeholder="e.g., arn:aws:bedrock:us-east-1:123456789:agent/abc123"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Owner Team *</label>
              <input
                type="text"
                value={ownerTeam}
                onChange={e => setOwnerTeam(e.target.value)}
                required
                placeholder="e.g., Platform Engineering"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Est. Cost per 1K Invocations</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={estimatedCostPer1k}
                  onChange={e => setEstimatedCostPer1k(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-medium text-slate-900 mb-4">Access & Risk Settings</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Approval Mode</label>
                <select
                  value={approvalMode}
                  onChange={e => setApprovalMode(e.target.value as ApprovalMode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {APPROVAL_MODE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {APPROVAL_MODE_OPTIONS.find(o => o.value === approvalMode)?.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Risk Level</label>
                <select
                  value={riskLevel}
                  onChange={e => setRiskLevel(e.target.value as RiskLevel)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {RISK_LEVEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as ListingVisibility)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {VISIBILITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-medium text-slate-900 mb-4">Metadata</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
                <input
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="comma-separated, e.g., nlp, customer-facing, production"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Capabilities</label>
                <input
                  type="text"
                  value={capabilities}
                  onChange={e => setCapabilities(e.target.value)}
                  placeholder="comma-separated, e.g., text generation, summarization, Q&A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Use Cases</label>
                <input
                  type="text"
                  value={useCases}
                  onChange={e => setUseCases(e.target.value)}
                  placeholder="comma-separated, e.g., customer support, content generation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Known Limitations</label>
                <input
                  type="text"
                  value={limitations}
                  onChange={e => setLimitations(e.target.value)}
                  placeholder="comma-separated, e.g., English only, 4K context limit"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Documentation URL</label>
                  <input
                    type="url"
                    value={documentationUrl}
                    onChange={e => setDocumentationUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Support Contact</label>
                  <input
                    type="text"
                    value={supportContact}
                    onChange={e => setSupportContact(e.target.value)}
                    placeholder="e.g., #platform-support or email"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name || !description || !resourceId || !ownerTeam}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-md transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MarketplaceAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [tab, setTab] = useState<TabId>(tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : 'listings');

  const handleTabChange = (newTab: TabId) => {
    setTab(newTab);
    searchParams.set('tab', newTab);
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <GovernPageLayout
      title="Marketplace Admin"
      description="Administer the agent marketplace — listings, approval workflows, subscriptions, and usage analytics."
    >
      <GovernTabs
        tabs={TABS}
        activeTab={tab}
        onTabChange={id => handleTabChange(id as TabId)}
      />

      {tab === 'listings' && <ListingsTab />}
      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </GovernPageLayout>
  );
}

function ListingsTab() {
  const [listings, setListings] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
  const [deprecateId, setDeprecateId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadListings();
  }, [statusFilter]);

  const loadListings = async () => {
    setLoading(true);
    try {
      const data = await governMarketplaceApi.listListings({
        page: 1,
        page_size: 100,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (listingId: string) => {
    try {
      await governMarketplaceApi.publishListing(listingId);
      loadListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish listing');
    }
  };

  const handleUnpublish = async (listingId: string) => {
    try {
      await governMarketplaceApi.unpublishListing(listingId);
      loadListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish listing');
    }
  };

  const handleDeprecate = async () => {
    if (!deprecateId) return;
    try {
      await governMarketplaceApi.deprecateListing(deprecateId);
      setDeprecateId(null);
      loadListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deprecate listing');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await governMarketplaceApi.deleteListing(deleteId);
      setDeleteId(null);
      loadListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete listing');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-500 hover:text-red-700">
            <Icon name="x-mark" className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ListingStatus | 'all')}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm"
          >
            <option value="all">All Status</option>
            {Object.entries(STATUS_STYLES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">
            {listings?.total || 0} listings
            {listings?.live ? <span className="ml-2"><LiveDataBadge /></span> : <span className="ml-2"><MockDataBadge /></span>}
          </span>
        </div>
        <button
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
          onClick={() => setShowCreateModal(true)}
        >
          <Icon name="plus" className="w-4 h-4 mr-1" />
          Create Listing
        </button>
      </div>

      {showCreateModal && (
        <CreateListingModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadListings}
        />
      )}

      {editingListing && (
        <EditListingModal
          listing={editingListing}
          onClose={() => setEditingListing(null)}
          onUpdated={loadListings}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Listing</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Owner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Subscribers</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {listings?.listings.map(listing => (
              <tr key={listing.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{listing.name}</div>
                  <div className="text-xs text-slate-500">{listing.category}</div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {RESOURCE_TYPE_LABELS[listing.resource_type]}
                </td>
                <td className="px-4 py-3">
                  <ListingStatusBadge status={listing.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{listing.owner_team}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{listing.subscriber_count}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {(listing.status === 'draft' || listing.status === 'published') && (
                    <button
                      onClick={() => setEditingListing(listing)}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      <Icon name="pencil-square" className="w-4 h-4 inline mr-1" />
                      Edit
                    </button>
                  )}
                  {listing.status === 'draft' && (
                    <button
                      onClick={() => handlePublish(listing.id)}
                      className="text-sm text-emerald-600 hover:text-emerald-800"
                    >
                      Publish
                    </button>
                  )}
                  {listing.status === 'published' && (
                    <>
                      <button
                        onClick={() => handleUnpublish(listing.id)}
                        className="text-sm text-slate-600 hover:text-slate-800"
                      >
                        Unpublish
                      </button>
                      <button
                        onClick={() => setDeprecateId(listing.id)}
                        className="text-sm text-amber-600 hover:text-amber-800"
                      >
                        Deprecate
                      </button>
                    </>
                  )}
                  {listing.status === 'draft' && (
                    <button
                      onClick={() => setDeleteId(listing.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!listings?.listings || listings.listings.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No listings found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Deprecate Confirmation Modal */}
      {deprecateId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirm Deprecate</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to deprecate this listing? Existing subscribers will retain access, but new subscriptions will be disabled.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeprecateId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDeprecate}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md"
              >
                Deprecate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirm Delete</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete this listing? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const config = SUBSCRIPTION_STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function SubscriptionsTab() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'all'>('all');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, [statusFilter]);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const data = await governMarketplaceApi.getAdminSubscriptions({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page: 1,
        page_size: 100,
      });
      setSubscriptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeId || !revokeReason.trim()) return;
    setRevoking(true);
    try {
      await governMarketplaceApi.revokeSubscription(revokeId, revokeReason.trim());
      setRevokeId(null);
      setRevokeReason('');
      loadSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke subscription');
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-500 hover:text-red-700">
            <Icon name="x-mark" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500">Total</div>
          <div className="text-2xl font-semibold text-slate-900">{subscriptions?.total || 0}</div>
        </div>
        <div className="bg-white border border-emerald-200 rounded-lg p-4">
          <div className="text-sm text-emerald-600">Active</div>
          <div className="text-2xl font-semibold text-emerald-700">{subscriptions?.active_count || 0}</div>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg p-4">
          <div className="text-sm text-amber-600">Pending</div>
          <div className="text-2xl font-semibold text-amber-700">{subscriptions?.pending_count || 0}</div>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-600">Revoked</div>
          <div className="text-2xl font-semibold text-red-700">{subscriptions?.revoked_count || 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500">Expired/Denied</div>
          <div className="text-2xl font-semibold text-slate-600">
            {(subscriptions?.expired_count || 0) + (subscriptions?.denied_count || 0)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as SubscriptionStatus | 'all')}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
            <option value="denied">Denied</option>
          </select>
          <span className="text-sm text-slate-500">
            {subscriptions?.live ? <span className="ml-2"><LiveDataBadge /></span> : <span className="ml-2"><MockDataBadge /></span>}
          </span>
        </div>
      </div>

      {/* Subscriptions table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Listing</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expires</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {subscriptions?.subscriptions.map(sub => (
              <tr key={sub.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="text-xs font-mono text-slate-600 truncate max-w-[120px]" title={sub.id}>
                    {sub.id.length > 12 ? `${sub.id.slice(0, 12)}...` : sub.id}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 text-sm">{sub.user_email}</div>
                  <div className="text-xs text-slate-500">{sub.business_unit}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-900">{sub.listing_name || sub.listing_id}</div>
                  <div className="text-xs text-slate-500">
                    {sub.resource_type ? RESOURCE_TYPE_LABELS[sub.resource_type] : '-'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SubscriptionStatusBadge status={sub.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : 'No expiry'}
                </td>
                <td className="px-4 py-3 text-right">
                  {sub.status === 'active' && (
                    <button
                      onClick={() => setRevokeId(sub.id)}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!subscriptions?.subscriptions || subscriptions.subscriptions.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No subscriptions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Revoke Confirmation Modal */}
      {revokeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Revoke Subscription</h3>
            <p className="text-slate-600 mb-4">
              This will immediately revoke access for the subscriber. Please provide a reason for this action.
            </p>
            <textarea
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
              placeholder="Enter revocation reason..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setRevokeId(null);
                  setRevokeReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={!revokeReason.trim() || revoking}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {revoking ? 'Revoking...' : 'Revoke Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalsTab() {
  const { user } = useUser();
  const [approvals, setApprovals] = useState<PendingApprovalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    setLoading(true);
    try {
      const data = await governMarketplaceApi.getPendingApprovals();
      setApprovals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (subscriptionId: string) => {
    try {
      await governMarketplaceApi.approveSubscription(subscriptionId, {
        // 'unknown', not 'admin': an approval is a governance decision, and naming a
        // plausible-looking approver for one nobody can identify is the defect this
        // branch removed everywhere else. 'unknown' is falsifiable; 'admin' is not.
        approved_by: user?.email || 'unknown',
      });
      loadApprovals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve subscription');
    }
  };

  const handleDeny = async () => {
    if (!denyId || !denyReason.trim()) return;
    try {
      await governMarketplaceApi.denySubscription(denyId, {
        // See handleApprove above - a denial carries the same accountability.
        denied_by: user?.email || 'unknown',
        reason: denyReason.trim(),
      });
      setDenyId(null);
      setDenyReason('');
      loadApprovals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny subscription');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {approvals?.total || 0} pending approvals
          {approvals?.live ? <span className="ml-2"><LiveDataBadge /></span> : <span className="ml-2"><MockDataBadge /></span>}
        </span>
      </div>

      {approvals?.total === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
          <Icon name="check-circle" className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
          <p className="text-slate-500">No pending approvals</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Requestor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Business Unit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Justification</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Requested</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {approvals?.subscriptions.map(sub => (
                <tr key={sub.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{sub.user_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-900">{sub.listing_name || sub.listing_id}</div>
                    <div className="text-xs text-slate-500">{sub.resource_type}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <div>{sub.business_unit}</div>
                    <div className="text-xs text-slate-400">{sub.cost_center}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                    {sub.justification || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleApprove(sub.id)}
                      className="text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setDenyId(sub.id)}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Deny
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deny Modal with Reason Input */}
      {denyId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Deny Subscription Request</h3>
            <p className="text-slate-600 mb-4">
              Please provide a reason for denying this subscription request. This will be shared with the requester.
            </p>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Enter denial reason..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDenyId(null); setDenyReason(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDeny}
                disabled={!denyReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deny Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<UsageAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Usage metering only maintains rolling 30-day counters (invocations_30d / cost_30d);
  // there are no timestamped usage events, so no other window can be computed. The
  // window is therefore fixed at 30 days rather than offered as a selector that
  // would return identical numbers for every choice.
  const ANALYTICS_WINDOW_DAYS = 30;

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await governMarketplaceApi.getUsageAnalytics(ANALYTICS_WINDOW_DAYS);
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {analytics?.live ? <LiveDataBadge /> : <MockDataBadge />}
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600"
          title="Usage metering keeps rolling 30-day counters only, so shorter or longer windows cannot be computed."
        >
          <Icon name="calendar" className="w-4 h-4 text-slate-400" />
          Rolling 30-day window (fixed)
        </span>
      </div>

      {analytics?.note && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <Icon name="information-circle" className="w-4 h-4 shrink-0 mt-px text-amber-500" />
          <span>{analytics.note}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-1">Total Subscribers</div>
          <div className="text-2xl font-semibold text-slate-900">{analytics?.total_subscribers || 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-1">Total Invocations</div>
          <div className="text-2xl font-semibold text-indigo-600">
            {(analytics?.total_invocations || 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500 mb-1">Total Cost</div>
          <div className="text-2xl font-semibold text-emerald-600">
            ${(analytics?.total_cost || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Usage by Business Unit */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Usage by Business Unit</h3>
        {analytics?.by_business_unit && analytics.by_business_unit.length > 0 ? (
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                <th className="pb-2">Business Unit</th>
                <th className="pb-2">Subscribers</th>
                <th className="pb-2">Invocations (30d)</th>
                <th className="pb-2">Cost (30d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.by_business_unit.map(bu => (
                <tr key={bu.business_unit}>
                  <td className="py-2 font-medium text-slate-900">{bu.business_unit}</td>
                  <td className="py-2 text-slate-600">{bu.subscriber_count}</td>
                  <td className="py-2 text-slate-600">{bu.total_invocations_30d.toLocaleString()}</td>
                  <td className="py-2 text-slate-600">${bu.total_cost_30d.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500 text-sm">No usage data available</p>
        )}
      </div>

      {/* Usage by Resource */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Usage by Resource</h3>
        {analytics?.by_resource && analytics.by_resource.length > 0 ? (
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                <th className="pb-2">Resource</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Subscribers</th>
                <th className="pb-2">Invocations (30d)</th>
                <th className="pb-2">Cost (30d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.by_resource.map(res => (
                <tr key={res.listing_id}>
                  <td className="py-2 font-medium text-slate-900">{res.listing_name}</td>
                  <td className="py-2 text-slate-600">{RESOURCE_TYPE_LABELS[res.resource_type]}</td>
                  <td className="py-2 text-slate-600">{res.subscriber_count}</td>
                  <td className="py-2 text-slate-600">{res.total_invocations_30d.toLocaleString()}</td>
                  <td className="py-2 text-slate-600">${res.total_cost_30d.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500 text-sm">No usage data available</p>
        )}
      </div>
    </div>
  );
}
