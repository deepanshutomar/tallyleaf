import { zipSync, strToU8 } from 'fflate';
import { allFields, missingPages, versionIndex } from './project';
import type { Field, Project } from './schema';

export type Cell = string | number | null;
export type Table = { header: string[]; rows: Cell[][] };

export function subscales(fields: Field[]): Map<string, Field[]> {
  const m = new Map<string, Field[]>();
  for (const f of fields) if (f.subscale) m.set(f.subscale, [...(m.get(f.subscale) ?? []), f]);
  return m;
}

/** Reverse-scored value: min + max - v. Raw data is never changed; only scores use this. */
export const scored = (f: Field, v: number) => (f.reverse && f.min !== undefined && f.max !== undefined ? f.min + f.max - v : v);

export function dataTable(p: Project, withScores = true): Table {
  const fields = allFields(p);
  const subs = withScores ? subscales(fields) : new Map<string, Field[]>();
  const header = ['serial', 'version', 'pages_missing', ...fields.map((f) => f.var)];
  for (const s of subs.keys()) header.push(`${s}_sum`, `${s}_mean`, `${s}_n`);
  header.push('unresolved_flags');
  const rows = [...p.responses].sort((a, b) => a.serial - b.serial).map((r) => {
    const row: Cell[] = [r.serial, versionIndex(p, r.fp), missingPages(p, r).join(' ') || null];
    for (const f of fields) row.push(r.values[f.var] ?? null);
    for (const items of subs.values()) {
      const vals = items.map((f) => r.values[f.var]).filter((v): v is number => typeof v === 'number');
      const sc = items.flatMap((f) => (typeof r.values[f.var] === 'number' ? [scored(f, r.values[f.var] as number)] : []));
      const sum = sc.reduce((a, b) => a + b, 0);
      row.push(vals.length === items.length ? sum : null, sc.length ? Math.round((sum / sc.length) * 1000) / 1000 : null, sc.length);
    }
    row.push(Object.keys(r.flags).length);
    return row;
  });
  return { header, rows };
}

export function codebookTable(p: Project): Table {
  const fields = allFields(p);
  const header = ['variable', 'label', 'type', 'values', 'reverse_scored', 'subscale', 'page'];
  const typeName = { choice: 'single choice', check: 'tick box (0/1)', digits: 'number', text: 'open text' } as const;
  const rows: Cell[][] = [
    ['serial', 'Participant serial number printed on the sheet', 'number', '', '', '', ''],
    ['version', 'Questionnaire layout version (1 = first printed)', 'number', '', '', '', ''],
    ['pages_missing', 'Pages of this participant not scanned yet', 'text', '', '', '', ''],
    ...fields.map((f): Cell[] => [
      f.var, f.label, typeName[f.type],
      f.type === 'choice' || f.type === 'check' ? (f.valueLabels ?? []).map((o) => `${o.value}=${o.label}`).join('; ') : '',
      f.reverse ? 'yes' : '', f.subscale ?? '', f.page,
    ]),
  ];
  for (const [s, items] of subscales(fields)) {
    const list = items.map((f) => f.var + (f.reverse ? ' (R)' : '')).join(', ');
    rows.push([`${s}_sum`, `Sum of ${list}; blank if any item missing`, 'score', '', '', s, '']);
    rows.push([`${s}_mean`, `Mean of answered items of ${s}`, 'score', '', '', s, '']);
    rows.push([`${s}_n`, `Number of answered items of ${s}`, 'score', '', '', s, '']);
  }
  rows.push(['unresolved_flags', 'Answers still marked for review', 'number', '', '', '', '']);
  return { header, rows };
}

const csvCell = (v: Cell) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(t: Table): string {
  return '﻿' + [t.header, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** SPSS syntax that reads the exported CSV and applies variable and value labels. */
export function spssSyntax(p: Project, csvName: string): string {
  const t = dataTable(p);
  const fields = new Map(allFields(p).map((f) => [f.var, f]));
  const q = (s: string) => `"${s.replace(/"/g, "''").replace(/\s+/g, ' ').slice(0, 250)}"`;
  const fmt = (h: string) => (h === 'pages_missing' || fields.get(h)?.type === 'text' ? 'A2000' : h.endsWith('_mean') ? 'F8.3' : 'F8.0');
  const lines = [
    '* PsychScan export. Put this file next to the CSV and run it in SPSS.',
    `* Edit the path below if SPSS cannot find ${csvName}.`,
    'GET DATA /TYPE=TXT',
    `  /FILE=${q(csvName)}`,
    '  /ENCODING="UTF8"',
    '  /DELIMITERS=","',
    `  /QUALIFIER='"'`,
    '  /ARRANGEMENT=DELIMITED',
    '  /FIRSTCASE=2',
    '  /VARIABLES=',
    ...t.header.map((h) => `    ${h} ${fmt(h)}`),
    '.',
    'VARIABLE LABELS',
    ...codebookTable(p).rows.map((r, i, a) => `  ${r[0]} ${q(String(r[1]))}${i === a.length - 1 ? '.' : ''}`),
  ];
  const labelled = [...fields.values()].filter((f) => (f.type === 'choice' || f.type === 'check') && f.valueLabels?.length);
  if (labelled.length) {
    lines.push('VALUE LABELS');
    labelled.forEach((f, i) => {
      lines.push(`  /${f.var}`);
      for (const o of f.valueLabels!) lines.push(`    ${o.value} ${q(o.label)}`);
      if (i === labelled.length - 1) lines[lines.length - 1] += '.';
    });
  }
  lines.push('EXECUTE.', '');
  return lines.join('\r\n');
}

const xml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colName(i: number): string {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function sheetXml(t: Table): string {
  const row = (cells: Cell[], r: number) =>
    `<row r="${r}">${cells.map((v, c) => {
      const ref = `${colName(c)}${r}`;
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${r === 1 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${[t.header, ...t.rows].map((r, i) => row(r, i + 1)).join('')}</sheetData></worksheet>`;
}

/** Minimal .xlsx with one sheet per table. */
export function toXlsx(sheets: { name: string; table: Table }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.table))));
  return zipSync(files);
}
