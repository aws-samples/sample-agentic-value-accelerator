interface StatusBadgeProps {
  variant: 'live' | 'cached' | 'simulated';
}

const config: Record<StatusBadgeProps['variant'], { color: string; label: string; pulse: boolean }> = {
  live: { color: '#10b981', label: 'LIVE', pulse: true },
  cached: { color: '#f59e0b', label: 'CACHED', pulse: false },
  simulated: { color: '#6b7280', label: 'Demo Data', pulse: false },
};

export function StatusBadge({ variant }: StatusBadgeProps) {
  const { color, label, pulse } = config[variant];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span
        style={{
          width: '8px', height: '8px', borderRadius: '50%', background: color,
          animation: pulse ? 'pulse-live 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>
        {label}
      </span>
    </span>
  );
}

export default StatusBadge;
