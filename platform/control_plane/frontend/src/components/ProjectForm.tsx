import { useState, useEffect } from 'react';
import { projectsApi, langfuseApi } from '../api/client';
import type { ProjectCreate, ProjectResponse, LangfuseServer } from '../types';
import LoadingSpinner from './LoadingSpinner';
import FormField from './FormField';

interface Props {
  onProjectGenerated: (project: ProjectResponse) => void;
}

const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

export default function ProjectForm({ onProjectGenerated }: Props) {
  const [formData, setFormData] = useState<ProjectCreate>({
    project_name: '',
    framework: 'langraph',
    iac_type: 'terraform',
    aws_region: 'us-east-1',
    tags: {},
  });

  const [langfuseServers, setLangfuseServers] = useState<LangfuseServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);

  useEffect(() => {
    loadLangfuseServers();
  }, []);

  const loadLangfuseServers = async () => {
    try {
      const servers = await langfuseApi.list();
      setLangfuseServers(servers.filter(s => s.status === 'active'));
    } catch (err) {
      console.error('Failed to load Langfuse servers:', err);
    } finally {
      setLoadingServers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const project = await projectsApi.generate(formData);
      onProjectGenerated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate project');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ProjectCreate, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isValidProjectName = (name: string) => {
    return /^[a-z0-9-]+$/.test(name) && !name.startsWith('-') && !name.endsWith('-');
  };

  const canSubmit = formData.project_name.length >= 3 && isValidProjectName(formData.project_name);

  return (
    <div className="card">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Name */}
        <FormField
          label="Project Name"
          required
          help="Lowercase letters, numbers, and hyphens only"
        >
          <input
            type="text"
            className="input-field"
            value={formData.project_name}
            onChange={(e) => handleInputChange('project_name', e.target.value)}
            placeholder="my-kyc-agent"
            pattern="[a-z0-9-]+"
            minLength={3}
            maxLength={50}
            required
          />
        </FormField>

        {/* Framework */}
        <FormField label="Agent Framework" required>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-left transition-all ${
                formData.framework === 'langraph'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleInputChange('framework', 'langraph')}
            >
              <div className="font-medium text-gray-900">LangGraph</div>
              <div className="text-sm text-gray-600 mt-1">
                State-based agent workflow
              </div>
            </button>

            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-left transition-all ${
                formData.framework === 'strands'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleInputChange('framework', 'strands')}
            >
              <div className="font-medium text-gray-900">Strands</div>
              <div className="text-sm text-gray-600 mt-1">
                Action-based agent framework
              </div>
            </button>
          </div>
        </FormField>

        {/* Infrastructure as Code */}
        <FormField label="Infrastructure as Code" required>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-center transition-all ${
                formData.iac_type === 'terraform'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleInputChange('iac_type', 'terraform')}
            >
              <div className="font-medium text-gray-900">Terraform</div>
              <div className="text-xs text-gray-600 mt-1">
                HCL-based IaC
              </div>
            </button>

            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-center transition-all ${
                formData.iac_type === 'cdk'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleInputChange('iac_type', 'cdk')}
            >
              <div className="font-medium text-gray-900">AWS CDK</div>
              <div className="text-xs text-gray-600 mt-1">
                TypeScript-based
              </div>
            </button>

            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-center transition-all ${
                formData.iac_type === 'cloudformation'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleInputChange('iac_type', 'cloudformation')}
            >
              <div className="font-medium text-gray-900">CloudFormation</div>
              <div className="text-xs text-gray-600 mt-1">
                YAML-based IaC
              </div>
            </button>
          </div>
        </FormField>

        {/* AWS Region */}
        <FormField label="AWS Region" required>
          <select
            className="input-field"
            value={formData.aws_region}
            onChange={(e) => handleInputChange('aws_region', e.target.value)}
          >
            {AWS_REGIONS.map(region => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </FormField>

        {/* Langfuse Server */}
        <FormField
          label="Langfuse Server"
          help="Optional: Select observability server"
        >
          <select
            className="input-field"
            value={formData.langfuse_server_id || ''}
            onChange={(e) => handleInputChange('langfuse_server_id', e.target.value || undefined)}
            disabled={loadingServers}
          >
            <option value="">None (skip observability)</option>
            {langfuseServers.map(server => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.region}){server.secret_name ? '' : ' - no secret configured'}
              </option>
            ))}
          </select>
        </FormField>

        {/* Tags */}
        <FormField
          label="Tags"
          help="Optional: Add key-value pairs"
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="input-field"
                placeholder="Key (e.g., environment)"
                disabled
              />
              <input
                type="text"
                className="input-field"
                placeholder="Value (e.g., dev)"
                disabled
              />
            </div>
            <p className="text-xs text-gray-500">Tag editing coming soon</p>
          </div>
        </FormField>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary px-8 py-3 text-base"
            disabled={!canSubmit || loading}
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <LoadingSpinner size="sm" />
                <span>Generating Project...</span>
              </span>
            ) : (
              'Generate Project'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
