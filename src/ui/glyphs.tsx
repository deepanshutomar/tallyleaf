import type { BlockKind } from '../lib/schema';

export function Logo() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="9" cy="14" r="6.5" fill="var(--ink)" />
      <circle cx="21" cy="14" r="5.6" fill="none" stroke="var(--red)" strokeWidth="1.8" />
    </svg>
  );
}

/** Tiny drawings of what each block looks like on paper. */
export function Glyph({ kind }: { kind: BlockKind }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } as const;
  return (
    <svg className="glyph" viewBox="0 0 34 24" aria-hidden="true">
      {kind === 'heading' && <><rect x="2" y="6" width="22" height="4" fill="currentColor" /><line x1="2" y1="15" x2="32" y2="15" {...s} /></>}
      {kind === 'text' && [5, 10, 15, 20].map((y, i) => <line key={y} x1="2" y1={y} x2={i === 3 ? 20 : 32} y2={y} {...s} />)}
      {kind === 'likert' && [6, 13, 20].map((y, r) => (
        <g key={y}>
          <line x1="2" y1={y} x2="9" y2={y} {...s} />
          {[14, 20, 26, 32].map((x, c) => <circle key={x} cx={x - 1} cy={y} r="2.2" {...s} fill={c === (r + 1) % 4 ? 'currentColor' : 'none'} />)}
        </g>
      ))}
      {kind === 'single' && <><line x1="2" y1="6" x2="24" y2="6" {...s} /><circle cx="5" cy="16" r="3" {...s} fill="currentColor" /><circle cx="16" cy="16" r="3" {...s} /><circle cx="27" cy="16" r="3" {...s} /></>}
      {kind === 'multi' && <><line x1="2" y1="6" x2="24" y2="6" {...s} />{[2, 13, 24].map((x, i) => <g key={x}><rect x={x} y="13" width="6" height="6" {...s} />{i !== 1 && <path d={`M${x + 1} ${16} l2 2 l4 -5`} {...s} />}</g>)}</>}
      {kind === 'number' && <><rect x="2" y="4" width="6" height="7" {...s} /><rect x="2" y="14" width="6" height="7" {...s} />{[13, 19, 25, 31].map((x, i) => <g key={x}><circle cx={x} cy="7.5" r="2" {...s} fill={i === 1 ? 'currentColor' : 'none'} /><circle cx={x} cy="17.5" r="2" {...s} fill={i === 3 ? 'currentColor' : 'none'} /></g>)}</>}
      {kind === 'open' && <><rect x="2" y="3" width="30" height="18" {...s} /><path d="M6 10 q2 -3 4 0 t4 0 t4 0" {...s} /><line x1="6" y1="16" x2="28" y2="16" {...s} strokeDasharray="1 2" /></>}
      {kind === 'pagebreak' && <><line x1="2" y1="12" x2="32" y2="12" {...s} strokeDasharray="3 2" /><path d="M14 6 l3 -3 l3 3 M14 18 l3 3 l3 -3" {...s} /></>}
    </svg>
  );
}
