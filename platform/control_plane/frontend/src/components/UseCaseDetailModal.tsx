import type { AppUseCase } from '../types';
import { useNavigate } from 'react-router-dom';

interface Props {
  useCase: AppUseCase;
  onClose: () => void;
}

export default function UseCaseDetailModal({ useCase, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-slate-200/60  animate-fade-in-scale" style={{ animationDuration: '0.2s' }} onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold">{useCase.id}</span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">{useCase.name}</h2>
          <p className="text-slate-500 leading-relaxed mb-6">{useCase.description}</p>

          <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Agents</h3>
            <div className="flex flex-wrap gap-1.5">
              {useCase.agents?.map(a => (
                <span key={a.id} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">{a.name}</span>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Supported Frameworks</h3>
            <div className="flex gap-2">
              {useCase.supported_frameworks?.map(fw => (
                <span key={fw} className="px-3 py-1.5 bg-slate-50 text-slate-700 rounded-xl text-sm font-medium border border-slate-200">
                  {fw === 'langchain_langgraph' ? 'LangChain + LangGraph' : fw === 'strands' ? 'Strands Agents SDK' : fw}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Deployment Pattern</h3>
            <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium border border-emerald-200">Amazon Bedrock AgentCore</span>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => { onClose(); navigate(`/applications/deploy/${useCase.use_case_name}`); }}
              className="btn-primary flex-1"
            >
              Deploy Application
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
