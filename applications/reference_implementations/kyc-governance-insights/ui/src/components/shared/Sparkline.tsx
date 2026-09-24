interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  showDot?: boolean;
}

export function Sparkline({ values, color, width = 60, height = 20, showDot = true }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const lastX = width;
  const lastY = height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <circle cx={lastX} cy={lastY} r="2" fill={color} />
      )}
    </svg>
  );
}

export default Sparkline;
