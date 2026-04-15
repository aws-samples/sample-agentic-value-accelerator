import { useState, useEffect } from 'react';
import { getTemplate, bootstrapProject } from '../api/client';
import LoadingSpinner from './LoadingSpinner';
import type { Template, Framework, DeploymentPattern, Parameter } from '../types';

interface BootstrapFormProps {
  templateId: string;
  onBack: () => void;
}

export default function BootstrapForm({ templateId, onBack }: BootstrapFormProps) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentPattern | null>(null);
  const [parameters, setParameters] = useState<Record<string, any>>({});

  useEffect(() => {
    loadTemplate();
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const data = await getTemplate(templateId);
      setTemplate(data);

      // Set defaults
      if (data.frameworks && data.frameworks.length > 0) {
        setSelectedFramework(data.frameworks[0]);
      }
      if (data.deployment_patterns && data.deployment_patterns.length > 0) {
        setSelectedDeployment(data.deployment_patterns[0]);
      }

      // Set parameter defaults
      if (data.parameters) {
        const defaults: Record<string, any> = {};
        data.parameters.forEach(param => {
          if (param.default !== undefined) {
            defaults[param.name] = param.default;
          }
        });
        setParameters(defaults);
      }

      setError(null);
    } catch (err) {
      setError('Failed to load template details. Please try again.');
      console.error('Error loading template:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleParameterChange = (paramName: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFramework || !selectedDeployment) {
      setError('Please select a framework and deployment pattern');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const request = {
        template_id: templateId,
        project_name: projectName,
        parameters: {
          ...parameters,
          project_name: projectName
        },
        framework_id: selectedFramework.id,
        deployment_pattern_id: selectedDeployment.id
      };

      const blob = await bootstrapProject(request);

      // Download the ZIP file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to bootstrap project. Please try again.');
      console.error('Error bootstrapping project:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Template not found.</p>
        <button onClick={onBack} className="mt-2 text-red-600 hover:text-red-800 underline">
          Back to catalog
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <svg
          className="mx-auto h-16 w-16 text-green-500 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Project Generated Successfully!
        </h2>
        <p className="text-gray-600 mb-6">
          Your project "{projectName}" has been downloaded. Extract the ZIP file and follow the README for next steps.
        </p>
        <div className="space-x-4">
          <button
            onClick={() => {
              setSuccess(false);
              setProjectName('');
              setParameters({});
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg"
          >
            Generate Another
          </button>
          <button
            onClick={onBack}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-6 rounded-lg"
          >
            Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center text-gray-600 hover:text-gray-900"
      >
        <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Catalog
      </button>

      {/* Template info */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {template.name}
        </h1>
        <p className="text-gray-600 mb-4">{template.description}</p>
        <span className="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded">
          {template.pattern_type.replace('_', ' ')}
        </span>
      </div>

      {/* Bootstrap form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Configure Your Project</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Project Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-agent-project"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Framework Selection */}
        {template.frameworks && template.frameworks.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Framework <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {template.frameworks.map(framework => (
                <label
                  key={framework.id}
                  className={`flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedFramework?.id === framework.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="framework"
                    checked={selectedFramework?.id === framework.id}
                    onChange={() => setSelectedFramework(framework)}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{framework.name}</div>
                    <div className="text-sm text-gray-600">{framework.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Deployment Pattern Selection */}
        {template.deployment_patterns && template.deployment_patterns.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deployment Pattern <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {template.deployment_patterns.map(pattern => (
                <label
                  key={pattern.id}
                  className={`flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedDeployment?.id === pattern.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="deployment"
                    checked={selectedDeployment?.id === pattern.id}
                    onChange={() => setSelectedDeployment(pattern)}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{pattern.name}</div>
                    <div className="text-sm text-gray-600">{pattern.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Template Parameters */}
        {template.parameters && template.parameters.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Template Parameters</h3>
            <div className="space-y-4">
              {template.parameters
                .filter(param => param.name !== 'project_name')
                .map(param => (
                  <ParameterInput
                    key={param.name}
                    parameter={param}
                    value={parameters[param.name]}
                    onChange={(value) => handleParameterChange(param.name, value)}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Submit buttons */}
        <div className="flex justify-end space-x-4 pt-4 border-t">
          <button
            type="button"
            onClick={onBack}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-6 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !projectName}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {submitting ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">Generating...</span>
              </>
            ) : (
              'Generate Project'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

interface ParameterInputProps {
  parameter: Parameter;
  value: any;
  onChange: (value: any) => void;
}

function ParameterInput({ parameter, value, onChange }: ParameterInputProps) {
  const renderInput = () => {
    switch (parameter.type) {
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        );

      case 'integer':
      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(parameter.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
            min={parameter.minimum}
            max={parameter.maximum}
            required={parameter.required}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={parameter.required}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {parameter.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        {parameter.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {parameter.description && (
        <p className="text-sm text-gray-500 mb-2">{parameter.description}</p>
      )}
      {renderInput()}
      {parameter.default !== undefined && (
        <p className="text-xs text-gray-500 mt-1">Default: {String(parameter.default)}</p>
      )}
    </div>
  );
}
