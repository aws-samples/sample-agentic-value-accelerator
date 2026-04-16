import type { ProjectResponse } from '../types';

interface Props {
  project: ProjectResponse;
  onReset: () => void;
}

export default function ProjectResult({ project, onReset }: Props) {
  const handleDownload = () => {
    window.open(project.s3_url, '_blank');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Project Generated Successfully
        </h2>
        <p className="text-gray-600">
          Your agent project is ready to download and deploy
        </p>
      </div>

      {/* Project Details Card */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Project Details
        </h3>

        <dl className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">Project Name</dt>
            <dd className="text-sm text-gray-900 font-mono">{project.project_name}</dd>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">Framework</dt>
            <dd className="text-sm text-gray-900 capitalize">{project.framework}</dd>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">Template</dt>
            <dd className="text-sm text-gray-900 font-mono">{project.template_name}</dd>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">Infrastructure</dt>
            <dd className="text-sm text-gray-900 capitalize">{project.iac_type}</dd>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">AWS Region</dt>
            <dd className="text-sm text-gray-900">{project.aws_region}</dd>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">Created</dt>
            <dd className="text-sm text-gray-900">{formatDate(project.created_at)}</dd>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-600">Download Link Expires</dt>
            <dd className="text-sm text-gray-900">{formatDate(project.expires_at)}</dd>
          </div>

          {project.tags && Object.keys(project.tags).length > 0 && (
            <div className="py-2">
              <dt className="text-sm font-medium text-gray-600 mb-2">Tags</dt>
              <dd className="flex flex-wrap gap-2">
                {Object.entries(project.tags).map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {key}: {value}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Download Instructions */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Next Steps
        </h3>
        <ol className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center mr-2 text-xs font-medium">
              1
            </span>
            <span>Download the project archive using the button below</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center mr-2 text-xs font-medium">
              2
            </span>
            <span>Extract the archive and navigate to the project directory</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center mr-2 text-xs font-medium">
              3
            </span>
            <span>Review the README.md for deployment instructions</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center mr-2 text-xs font-medium">
              4
            </span>
            <span>
              Deploy infrastructure using {project.iac_type === 'cdk' ? 'AWS CDK' : project.iac_type === 'cloudformation' ? 'CloudFormation' : 'Terraform'} in the iac/{project.iac_type}/ directory
            </span>
          </li>
        </ol>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-4">
        <button
          onClick={handleDownload}
          className="flex-1 btn-primary py-3 text-base"
        >
          Download Project
        </button>
        <button
          onClick={onReset}
          className="btn-secondary py-3 text-base"
        >
          Generate Another
        </button>
      </div>
    </div>
  );
}
