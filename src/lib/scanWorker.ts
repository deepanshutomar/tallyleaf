import { scanPage, type Gray, type RGBA } from './scan';
import type { Version } from './schema';

export type WorkerIn = { id: number; img: RGBA; projectId: string; versions: Version[] };
export type WorkerOut =
  | { id: number; ok: true; serial: number; fp: string; page: number; fields: Record<string, { value: number | string | null; flag?: string }>; crops: Record<string, Gray> }
  | { id: number; ok: false; error: string; serial?: number; page?: number };

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const { id, img, projectId, versions } = e.data;
  let out: WorkerOut;
  try {
    const res = scanPage(img, (s) => {
      if (s.formId !== projectId) return `This sheet belongs to a different questionnaire (code ${s.formId}), not this project.`;
      return versions.find((v) => v.fp === s.fp) ??
        'This sheet was printed from a version of the questionnaire that is not in this project file. Open the newest project file (or the PDF the sheets were printed from) and scan again.';
    });
    out = res.ok
      ? { id, ok: true, serial: res.sheet.serial, fp: res.sheet.fp, page: res.sheet.page, fields: res.fields, crops: res.crops }
      : { id, ok: false, error: res.error, serial: res.sheet?.serial, page: res.sheet?.page };
  } catch (err) {
    out = { id, ok: false, error: `Could not process this image (${(err as Error).message}).` };
  }
  (self as unknown as Worker).postMessage(out);
};
