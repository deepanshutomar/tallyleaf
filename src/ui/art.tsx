import type { ReactNode } from 'react';

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export type IconName = 'home' | 'build' | 'print' | 'scan' | 'data' | 'save' | 'help' | 'plus' | 'check' | 'info' | 'chev' | 'camera' | 'upload' | 'folder' | 'x';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h4.5v-6h4v6h4.5V9" {...s} />,
  build: <><path d="m12 3 9 4.5-9 4.5-9-4.5z" {...s} /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" {...s} /></>,
  print: <><path d="M7 8V3h10v5M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3" {...s} /><path d="M7 14h10v7H7z" {...s} /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" {...s} /><path d="M12 8v8M8 12h8" {...s} /></>,
  data: <><path d="M4 20h16" {...s} /><path d="M6 20v-6h3v6M10.5 20V8h3v12M15 20v-9h3v9" {...s} /></>,
  save: <><path d="M5 3h11l3 3v15H5z" {...s} /><path d="M8 3v5h7V3M8 21v-7h8v7" {...s} /></>,
  help: <><circle cx="12" cy="12" r="9" {...s} /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" {...s} /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" {...s} />,
  check: <path d="m4.5 12.5 4.5 4.5L19.5 6.5" {...s} strokeWidth={2.4} />,
  info: <><circle cx="12" cy="12" r="9" {...s} /><path d="M12 11v6" {...s} /><circle cx="12" cy="7.8" r=".7" fill="currentColor" /></>,
  chev: <path d="m6 9 6 6 6-6" {...s} />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" {...s} /><circle cx="12" cy="13" r="3.5" {...s} /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" {...s} /><path d="M4 15v4h16v-4" {...s} /></>,
  folder: <path d="M3 6h6l2 2h10v11H3z" {...s} />,
  x: <path d="M6 6l12 12M18 6 6 18" {...s} />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>;
}

/** Botanical line drawing for the sidebar. */
export function Sprig() {
  const leaf = (x: number, y: number, r: number, l = 13) => (
    <path d={`M0 0 q${l * 0.5} -5 ${l} 0 q-${l * 0.5} 5 -${l} 0z`} transform={`translate(${x} ${y}) rotate(${r})`} />
  );
  const bud = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-3.2" rx="1.7" ry="3" transform={`rotate(${a})`} />)}
      <circle r="1.1" />
    </g>
  );
  return (
    <svg className="sprig" viewBox="0 0 140 240" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M120 238 C 104 190, 96 150, 100 110 S 92 40, 78 8" />
      <path d="M101 120 C 86 112, 72 102, 60 84" />
      <path d="M99 160 C 82 156, 66 150, 50 140" />
      <path d="M100 90 C 112 76, 118 62, 120 46" />
      <path d="M96 60 C 84 52, 78 40, 74 28" />
      {leaf(80, 98, -130)}{leaf(70, 92, -150, 11)}{leaf(64, 146, -165)}{leaf(76, 152, -150, 11)}
      {leaf(106, 72, -60)}{leaf(112, 98, -20, 11)}{leaf(104, 140, 10)}{leaf(92, 186, -170, 12)}
      {leaf(86, 46, -120, 10)}{leaf(104, 200, 20, 12)}
      {bud(60, 84)}{bud(50, 140)}{bud(120, 46)}{bud(74, 28)}{bud(78, 8)}
    </svg>
  );
}

function qrCells(): [number, number][] {
  const cells: [number, number][] = [];
  let seed = 7;
  for (let r = 0; r < 11; r++)
    for (let c = 0; c < 11; c++) {
      const finder = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
      seed = (seed * 9301 + 49297) % 233280;
      if (finder ? !(r % 10 === 1 && c % 10 === 1) && !(r === 1 && c === 9) && !(r === 9 && c === 1) : seed / 233280 > 0.52) cells.push([r, c]);
    }
  return cells;
}
const QR = qrCells();
const FILLS = [2, 0, 3, 1, 1, 2, 0];

/** The product, drawn: a stack of printed sheets; the top one fills itself in and gets scanned. */
export function SheetArt({ pins = false, scanning = true }: { pins?: boolean; scanning?: boolean }) {
  const rows = [118, 140, 162, 184, 206, 228, 250];
  const cols = [176, 198, 220, 242, 264];
  const widths = [96, 120, 104, 70, 112, 90, 118];
  return (
    <div className="sheetart-wrap">
      <span className="halo" />
      <svg className="sparks" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 16 4 4M18 14l6-11M24 22l12-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
      <svg className="sheetart" viewBox="-14 -6 330 452" role="img" aria-label="A stack of printed questionnaires; bubbles on the top sheet fill in and a scan line passes over it">
        {[3, 2, 1].map((k) => <rect key={k} className="under" x={k * 4} y={k * 5} width="299" height="423" rx="3" />)}
        <rect className="paper" x="0.5" y="0.5" width="299" height="423" rx="3" />
        {[[12, 12], [278, 12], [12, 402], [278, 402]].map(([x, y]) => <rect key={`${x}${y}`} className="ink" x={x} y={y} width="10" height="10" />)}
        <g transform="translate(240 14)">{QR.map(([r, c]) => <rect key={`${r}-${c}`} className="ink" x={c * 3} y={r * 3} width="3" height="3" />)}</g>
        <rect className="ink" x="34" y="20" width="112" height="7" rx="1" />
        <rect className="bar" x="34" y="33" width="78" height="4" rx="2" />
        <text x="232" y="29" textAnchor="end" className="id">ID 00017</text>
        <line x1="34" y1="56" x2="288" y2="56" className="rule" />
        <rect className="bar" x="34" y="66" width="60" height="4" rx="2" />
        {[44, 84, 124, 164].map((x, i) => (
          <g key={x}>
            <circle className="ring" cx={x} cy="84" r="5" />
            {i === 2 && <circle className="fill" cx={x} cy="84" r="4.2" style={{ ['--d' as string]: '0s' }} />}
            <rect className="bar" x={x + 9} y="82" width="20" height="4" rx="2" />
          </g>
        ))}
        <rect x="34" y="100" width="254" height="10" className="band" />
        {cols.map((x) => <rect key={x} className="bar" x={x - 7} y="103.5" width="14" height="3" rx="1.5" />)}
        {rows.map((y, r) => (
          <g key={y}>
            {r % 2 === 0 && <rect x="34" y={y - 9} width="254" height="18" className="zebra" />}
            <rect className="bar" x="40" y={y - 2} width={widths[r]} height="4" rx="2" />
            {cols.map((x, c) => (
              <g key={x}>
                <circle className="ring" cx={x} cy={y} r="5.5" />
                {FILLS[r] + 1 === c && <circle className="fill" cx={x} cy={y} r="4.6" style={{ ['--d' as string]: `${0.45 * (r + 1)}s` }} />}
              </g>
            ))}
          </g>
        ))}
        <rect className="bar" x="34" y="276" width="90" height="4" rx="2" />
        <rect x="34" y="290" width="254" height="58" className="box" rx="2" />
        {[306, 322, 338].map((y) => <line key={y} x1="40" y1={y} x2="282" y2={y} className="line" />)}
        <path d="M44 303 q4 -7 8 0 t8 0 t8 0 t8 0 q3 -6 7 0 t8 0 t9 0" className="fill pen" style={{ ['--d' as string]: '3.6s' }} />
        {scanning && <rect className="scan" x="0" y="50" width="300" height="3" />}
        {pins && (
          <g className="tag">
            <circle cx="30" cy="30" r="7" /><text x="30" y="33" textAnchor="middle">1</text>
            <circle cx="236" cy="54" r="7" /><text x="236" y="57" textAnchor="middle">2</text>
            <circle cx="196" cy="40" r="7" /><text x="196" y="43" textAnchor="middle">3</text>
            <circle cx="160" cy="166" r="7" /><text x="160" y="169" textAnchor="middle">4</text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function PageHead({ step, title, lead, art }: { step?: number; title: ReactNode; lead: ReactNode; art?: ReactNode }) {
  return (
    <section className={`pagehead ${art ? 'with-art' : ''}`}>
      <div>
        {step && <span className="pill">Step {step} of 4</span>}
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
      </div>
      {art && <div className="pagehead-art">{art}</div>}
    </section>
  );
}
