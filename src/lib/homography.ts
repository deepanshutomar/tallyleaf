export type P = [number, number];
/** 3x3 row-major, h[8] = 1. Maps page mm -> image px. */
export type H = number[];

/** Least-squares homography from >= 4 point pairs (src -> dst). */
export function solveHomography(src: P[], dst: P[]): H {
  const ata = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const atb = new Array(8).fill(0);
  const add = (row: number[], b: number) => {
    for (let i = 0; i < 8; i++) {
      atb[i] += row[i] * b;
      for (let j = 0; j < 8; j++) ata[i][j] += row[i] * row[j];
    }
  };
  src.forEach(([x, y], k) => {
    const [u, v] = dst[k];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  });
  return [...gauss(ata, atb), 1];
}

function gauss(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) throw new Error('Degenerate point set');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

export function apply(h: H, x: number, y: number): P {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** Approximate image pixels per mm around a page point. */
export function scaleAt(h: H, x: number, y: number): number {
  const [ax, ay] = apply(h, x, y);
  const [bx, by] = apply(h, x + 1, y);
  const [cx, cy] = apply(h, x, y + 1);
  return Math.sqrt(Math.hypot(bx - ax, by - ay) * Math.hypot(cx - ax, cy - ay));
}
