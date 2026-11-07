export type SheetId = { formId: string; fp: string; serial: number; page: number };

const PREFIX = 'PSY1';

export function encodeSheet(s: SheetId): string {
  return [PREFIX, s.formId, s.fp, s.serial, s.page].join('|');
}

export function decodeSheet(text: string): SheetId | null {
  const p = text.trim().split('|');
  if (p.length !== 5 || p[0] !== PREFIX) return null;
  const serial = Number(p[3]);
  const page = Number(p[4]);
  if (!Number.isInteger(serial) || !Number.isInteger(page)) return null;
  return { formId: p[1], fp: p[2], serial, page };
}

export const formatSerial = (n: number) => String(n).padStart(5, '0');
