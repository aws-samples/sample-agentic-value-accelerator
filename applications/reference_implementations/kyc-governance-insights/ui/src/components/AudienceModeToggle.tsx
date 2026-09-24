import { useAudience, type AudienceMode } from '../contexts/AudienceContext';

const modes: AudienceMode[] = ['Executive', 'Compliance', 'Engineering'];

export default function AudienceModeToggle() {
  const { mode, setMode } = useAudience();

  return (
    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '4px 10px',
            fontSize: '9px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: mode === m ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            color: mode === m ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
