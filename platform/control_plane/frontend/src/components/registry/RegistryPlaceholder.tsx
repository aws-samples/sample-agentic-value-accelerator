import { Link } from 'react-router-dom';

// Placeholder page for a Registry section whose backend wrappers aren't
// wired yet. Same hero + "coming soon" pane the other Registry pages will
// eventually replace with a real listing. Kept generic so all three
// pending sections (Agents / Skills / Custom Resources) share one shell —
// backend routes will slot in later as the AWS Agent Registry API surface
// lands in boto3.
interface Props {
  section: 'agents' | 'skills' | 'custom-resources';
  title: string;
  tagline: string;
  description: string;
  bulletHeading: string;
  bullets: string[];
  iconBg: string; // tailwind gradient e.g. "from-indigo-500 to-blue-600"
  iconPath: string;
  tags: string[];
}

export default function RegistryPlaceholder({
  section, title, tagline, description, bulletHeading, bullets, iconBg, iconPath, tags,
}: Props) {
  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/registry" className="hover:text-slate-700">Registry</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">{title}</span>
      </div>

      <div className={`rounded-2xl p-8 mb-6 text-white shadow-lg bg-gradient-to-br ${iconBg}`}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Registry
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Coming soon
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
              </svg>
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            </div>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">{tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {tags.map((t) => (
            <span key={t} className="text-[10px] font-medium text-white/90 bg-white/15 px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>

        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-4 py-3">
          <div className="text-xs font-semibold text-indigo-800 uppercase tracking-wider mb-2">
            {bulletHeading}
          </div>
          <ul className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <svg className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75" />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <strong>Placeholder.</strong> This page is wired into the sidebar and Registry landing but the
            underlying <code className="bg-white px-1 rounded">agent-registry-control</code> API wrappers aren't
            live yet. Once the backend routes ship, this view will show published records with search,
            approval status, and per-record detail — same shape as MCP Servers and A2A Agents.
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-2 text-xs">
          <Link to="/registry" className="text-indigo-700 hover:underline">← Back to Registry</Link>
          <span className="text-slate-300">·</span>
          <Link to="/operate/approvals" className="text-indigo-700 hover:underline">Approval Queue →</Link>
          <span className="text-slate-300">·</span>
          <Link to="/mcp" className="text-indigo-700 hover:underline">MCP Servers</Link>
          <span className="text-slate-300">·</span>
          <Link to="/a2a" className="text-indigo-700 hover:underline">A2A Agents</Link>
        </div>
      </div>
      {/* Section slug retained so future backend wiring can pick this up
          without renaming the file. Currently unused visually. */}
      <div className="hidden" data-section={section} />
    </div>
  );
}
