// SwarmConstellation.tsx — the signature motif, reimagined as a SECURITY ENGRAVING: the
// fine-line guilloché rosette you find on a share certificate or banknote, generated from
// the active desk's own agent roster. Two woven bands of interfering scalloped rings form
// the engine-turned lacework; the roster sits on the inner band as engraved points, each
// linked to the coordinator hub by a hairline routing spoke. The plate "inks itself in" on
// load, band by band, like a certificate coming off the press. Persona-aware (nodes + ink
// wear each desk's accent); pure decoration — aria-hidden, and every stroke's motion
// collapses under prefers-reduced-motion via the global rule in styles.css.

import { useMemo } from 'react';
import { usePersona } from './personaContext';

const VB = 440;
const C = VB / 2;

/** One scalloped ring: a circle of radius R modulated by k lobes of amplitude A, phase p,
 *  rendered as a closed SVG path. Rotating many of these by small steps weaves the rosette. */
function scallop(R: number, k: number, A: number, p: number, rot: number, steps = 240): string {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = R + A * Math.cos(k * t + p);
    const x = C + r * Math.cos(t + rot);
    const y = C + r * Math.sin(t + rot);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  return d + 'Z';
}

/** A woven band: `copies` scalloped rings, each rotated a step further, so their lobes
 *  interleave into the classic guilloché weave. */
function band(R: number, k: number, A: number, copies: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < copies; i++) {
    out.push(scallop(R, k, A, 0, (i / copies) * ((Math.PI * 2) / k)));
  }
  return out;
}

export function SwarmConstellation({ className }: { className?: string }) {
  const { persona } = usePersona();

  const { bands, nodes, spokes } = useMemo(() => {
    // Two interleaved bands + a small inner rosette = a certificate seal's engine-turning.
    const bands = [
      { paths: band(150, 16, 14, 20), w: 0.5, o: 0.38, delay: 0.0 },
      { paths: band(112, 12, 18, 16), w: 0.5, o: 0.42, delay: 0.3 },
      { paths: band(70, 20, 9, 14), w: 0.45, o: 0.4, delay: 0.55 },
    ];

    // Roster on the inner rosette: coordinator at the hub, specialists on a ring.
    const order = persona.order;
    const hub = order[0];
    const ringKeys = order.slice(1);
    const colorFor = (k: string) => persona.agents[k]?.color || 'var(--primary)';
    const nodeR = 92;
    const nodes = [{ x: C, y: C, key: hub, color: colorFor(hub), hub: true }];
    const spokes: { x2: number; y2: number; color: string; delay: number }[] = [];
    ringKeys.forEach((key, i) => {
      const a = (i / ringKeys.length) * Math.PI * 2 - Math.PI / 2;
      const x = C + Math.cos(a) * nodeR;
      const y = C + Math.sin(a) * nodeR;
      nodes.push({ x, y, key, color: colorFor(key), hub: false });
      spokes.push({ x2: x, y2: y, color: colorFor(key), delay: 0.9 + i * 0.04 });
    });
    return { bands, nodes, spokes };
  }, [persona]);

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible' }}
    >
      {/* Plate border — the twin ruled circles that frame an engraved seal. */}
      <circle cx={C} cy={C} r={170} fill="none" stroke="var(--primary)" strokeOpacity={0.55} strokeWidth={1} />
      <circle cx={C} cy={C} r={165} fill="none" stroke="var(--primary)" strokeOpacity={0.3} strokeWidth={0.6} />

      {/* Guilloché weave — each band inks itself in as one group so the seal reads as a
          plate being printed, then rests fully drawn. pathLength normalizes the draw-on. */}
      {bands.map((b, bi) => (
        <g
          key={bi}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={b.w}
          strokeOpacity={b.o}
          strokeLinejoin="round"
        >
          {b.paths.map((d, i) => (
            <path
              key={i}
              d={d}
              pathLength={1000}
              className="ink-draw"
              style={{ ['--len' as string]: 1000, animationDelay: `${b.delay + i * 0.015}s`, animationDuration: '1.2s' }}
            />
          ))}
        </g>
      ))}

      {/* Radial hairlines from the hub to each specialist — the routing spokes, drawn faint. */}
      <g>
        {spokes.map((s, i) => (
          <line
            key={i}
            x1={C}
            y1={C}
            x2={s.x2}
            y2={s.y2}
            stroke={s.color}
            strokeOpacity={0.3}
            strokeWidth={0.7}
            pathLength={1000}
            className="ink-draw"
            style={{ ['--len' as string]: 1000, animationDelay: `${s.delay}s`, animationDuration: '0.9s' }}
          />
        ))}
      </g>

      {/* Roster points — engraved dots: a fine ink ring around a filled core, hub largest. */}
      <g>
        {nodes.map((n, i) => {
          const rr = n.hub ? 6.5 : 3.8;
          return (
            <g key={n.key} className="animate-fade-rise" style={{ animationDelay: `${1.0 + i * 0.04}s` }}>
              <circle cx={n.x} cy={n.y} r={rr + 3} fill="var(--elevated)" />
              <circle cx={n.x} cy={n.y} r={rr + 3} fill="none" stroke={n.color} strokeOpacity={0.5} strokeWidth={0.8} />
              <circle cx={n.x} cy={n.y} r={rr} fill={n.color} fillOpacity={0.92} />
              {n.hub && (
                <circle cx={n.x} cy={n.y} r={rr + 8} fill="none" stroke={n.color} strokeOpacity={0.3} strokeWidth={0.7} className="animate-breathe" />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
