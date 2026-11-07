import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import guideText from '../skills/tallyleaf/SKILL.md?raw';
import { exampleProject } from '../src/lib/example';
import { codebookTable, correctionsTable, dataTable, spssSyntax, toCsv, toXlsx } from '../src/lib/export';
import { GFORM_STEPS, googleFormScript } from '../src/lib/gform';
import { batchPdf, layoutForm, previewPdf, unsupportedChars } from '../src/lib/pdf';
import {
  addBatch, addReservation, allFields, applyPage, deleteResponses, fieldFor, freezeVersion, lockConflicts, mergeProjects,
  missingPages, nextFreeSerial, parseProject, printedCount, resolveClash, serialProblem, setAnswers,
} from '../src/lib/project';
import { formatSerial } from '../src/lib/qr';
import { scanPage } from '../src/lib/scan';
import { APP_VERSION, blockVars, newProject, validateForm, type Field, type Flag, type FormDef, type Project } from '../src/lib/schema';
import { collectInputs, dataUrlToBuffer, grayToDataUrl, pagesFrom } from './io';
import { QUESTIONNAIRE_HELP, parseQuestionnaire, questionnaireToYaml } from './spec';

type Flags = Record<string, string | boolean>;
type Args = { _: string[]; flags: Flags };
type Out = { log: (s?: string) => void; err: (s: string) => void };

class UserError extends Error {}

const BOOL = new Set(['json', 'replace', 'keep-empty', 'no-duplex', 'force', 'claude', 'codex', 'help', 'version']);
const ALIAS: Record<string, string> = { o: 'out', h: 'help', v: 'version', n: 'copies' };

export function parseArgs(argv: string[]): Args {
  const a: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--') { a._.push(...argv.slice(i + 1)); break; }
    const m = t.match(/^--?([^=]+)(?:=(.*))?$/);
    if (!m || /^-\d/.test(t)) { a._.push(t); continue; }
    const key = ALIAS[m[1]] ?? m[1];
    if (m[2] !== undefined) a.flags[key] = m[2];
    else if (BOOL.has(key)) a.flags[key] = true;
    else if (i + 1 < argv.length) a.flags[key] = argv[++i];
    else throw new UserError(`--${key} needs a value.`);
  }
  return a;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'questionnaire';
const isProjectFile = (p: string) => /\.(tallyleaf|psyform)$/i.test(p);
const need = (v: string | undefined, what: string) => { if (!v) throw new UserError(`Missing ${what}. Run "tallyleaf help" for usage.`); return v; };
const str = (f: Flags, k: string) => (typeof f[k] === 'string' ? (f[k] as string) : undefined);
const int = (f: Flags, k: string, d: number) => {
  const v = str(f, k);
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UserError(`--${k} must be a whole number of 1 or more.`);
  return n;
};

function readText(path: string): string {
  if (!existsSync(path)) throw new UserError(`File not found: ${path}`);
  return readFileSync(path, 'utf8');
}

function loadProject(path: string): Project {
  return parseProject(readText(path));
}

function saveProject(path: string, p: Project) {
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  const now = new Date().toISOString();
  writeFileSync(path, JSON.stringify({ ...p, updatedAt: p.updatedAt ?? now, lastFileSaveAt: now }, null, 1));
}

function loadForm(path: string): { form: FormDef; project?: Project } {
  if (isProjectFile(path)) { const project = loadProject(path); return { form: project.form, project }; }
  return { form: parseQuestionnaire(readText(path)) };
}

function writeNew(path: string, data: string | Uint8Array, force: boolean) {
  if (existsSync(path) && !force) throw new UserError(`${path} already exists. Use another name, or add --force to overwrite.`);
  writeFileSync(path, data);
}

const FLAG_MEANING: Record<Flag, string> = {
  blank: 'nothing marked: skipped? set to missing, or to the answer if you can see one',
  faint: 'very light mark: decide if it was meant as an answer',
  multiple: 'two or more options marked: pick the intended one, or missing',
  unclear: 'marks hard to tell apart: pick the intended one',
  'missing-page': 'page not scanned yet',
  text: 'handwriting: type exactly what is written',
  'text-empty': 'answer box looks empty: confirm missing, or type what is written',
  'group-empty': 'nothing ticked: set all columns of this question to 0 (none apply) or missing (skipped)',
};
const SOFT = new Set<Flag>(['blank', 'text-empty', 'group-empty']);

function summary(p: Project) {
  const flags = p.responses.flatMap((r) => Object.values(r.flags));
  return {
    title: p.form.title,
    printed: printedCount(p),
    batches: p.batches.length,
    versions: p.versions.length,
    participants: p.responses.length,
    toCheck: flags.filter((f) => !SOFT.has(f)).length,
    skipped: flags.filter((f) => SOFT.has(f)).length,
    missingPages: p.responses.filter((r) => missingPages(p, r).length).map((r) => ({ id: r.serial, pages: missingPages(p, r) })),
    clashes: (p.clashes ?? []).map((c) => ({ id: c.serial, from: c.source })),
    reservations: (p.reservations ?? []).map((r) => ({ name: r.name, from: r.from, to: r.to })),
    nextId: nextFreeSerial(p),
  };
}

function coerce(f: Field, raw: string): number | string | null {
  const v = raw.trim();
  if (v === '' || v.toLowerCase() === 'missing' || v.toLowerCase() === 'null') return null;
  if (f.type === 'text') return raw;
  if (f.type === 'digits') {
    if (!/^\d+$/.test(v)) throw new UserError(`${f.var} takes digits only (got "${raw}").`);
    if (f.digits && v.length > f.digits) throw new UserError(`${f.var} has at most ${f.digits} digits.`);
    return f.asText ? v : Number(v);
  }
  const n = Number(v);
  const allowed = (f.valueLabels ?? []).map((o) => o.value);
  if (!Number.isFinite(n) || !allowed.includes(n))
    throw new UserError(`${f.var} must be one of ${(f.valueLabels ?? []).map((o) => `${o.value} (${o.label})`).join(', ')}, or "missing".`);
  return n;
}

export async function run(argv: string[], out: Out = { log: (s = '') => process.stdout.write(`${s}\n`), err: (s) => process.stderr.write(`${s}\n`) }): Promise<number> {
  let json = false;
  const emit = (data: unknown, human: () => void) => { if (json) out.log(JSON.stringify({ ok: true, ...(data as object) }, null, 2)); else human(); };
  try {
    const { _: pos, flags } = parseArgs(argv);
    json = !!flags.json;
    const force = !!flags.force;
    const cmd = flags.version ? 'version' : (pos.shift() ?? 'help');
    if (flags.help && cmd !== 'help') { out.log(HELP); return 0; }

    switch (cmd) {
      case 'help':
        out.log(HELP);
        return 0;
      case 'version':
        emit({ version: APP_VERSION }, () => out.log(`tallyleaf ${APP_VERSION}`));
        return 0;
      case 'guide':
        out.log(guideText);
        return 0;

      case 'init': {
        const file = pos[0] ?? 'questionnaire.yaml';
        writeNew(file, `${QUESTIONNAIRE_HELP}\n${questionnaireToYaml(exampleProject().form)}`, force);
        emit({ file }, () => out.log(`Wrote ${file}: an example questionnaire using every block type. Edit it, then run: tallyleaf check ${file}`));
        return 0;
      }

      case 'check': {
        const file = need(pos[0], 'questionnaire or project file');
        const { form, project } = loadForm(file);
        const errors = [...validateForm(form), ...(project ? lockConflicts(project, form) : [])];
        if (errors.length) throw new UserError(`${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
        const layout = await layoutForm(form);
        const bad = await unsupportedChars(form);
        const columns = form.blocks.flatMap(blockVars);
        const subscales = [...new Set(form.blocks.flatMap((b) => (b.kind === 'likert' ? b.items.map((i) => i.subscale).filter(Boolean) as string[] : [])))];
        const warnings = bad.length ? [`These characters can't be printed yet and would show as "?": ${bad.join(' ')}`] : [];
        emit({ title: form.title, pagesPerCopy: layout.pages.length, columns, subscales, warnings }, () => {
          out.log(`✓ "${form.title}" is valid.`);
          out.log(`  ${layout.pages.length} page(s) per copy · ${columns.length} column(s)${subscales.length ? ` · subscales: ${subscales.join(', ')}` : ''}`);
          out.log(`  Columns: ${columns.join(', ')}`);
          for (const w of warnings) out.log(`  ! ${w}`);
        });
        return 0;
      }

      case 'preview': {
        const file = need(pos[0], 'questionnaire or project file');
        const { form } = loadForm(file);
        const target = str(flags, 'out') ?? `${slug(form.title)}-preview.pdf`;
        const { bytes, pages } = await previewPdf(form);
        writeFileSync(target, bytes);
        emit({ file: target, pages }, () => out.log(`Wrote ${target} (${pages} page(s), marked PREVIEW, no IDs used).`));
        return 0;
      }

      case 'new': {
        const file = need(pos[0], 'questionnaire file');
        const form = parseQuestionnaire(readText(file));
        const target = str(flags, 'out') ?? `${slug(form.title)}.tallyleaf`;
        if (existsSync(target) && !force) throw new UserError(`${target} already exists. Use -o for another name, or --force.`);
        const p = { ...newProject(form.title), form };
        saveProject(target, p);
        emit({ project: target, id: p.id }, () => out.log(`Created ${target}. Next: tallyleaf print ${target} --copies 30`));
        return 0;
      }

      case 'form': {
        const p = loadProject(need(pos[0], 'project file'));
        const yaml = `${QUESTIONNAIRE_HELP}\n${questionnaireToYaml(p.form)}`;
        const target = str(flags, 'out');
        if (target) { writeNew(target, yaml, force); emit({ file: target }, () => out.log(`Wrote ${target}.`)); }
        else if (json) emit({ yaml }, () => undefined);
        else out.log(yaml);
        return 0;
      }

      case 'update': {
        const pf = need(pos[0], 'project file');
        const p = loadProject(pf);
        const form = parseQuestionnaire(readText(need(pos[1], 'questionnaire file')));
        const conflicts = lockConflicts(p, form);
        if (conflicts.length) throw new UserError(`Can't update:\n- ${conflicts.join('\n- ')}`);
        saveProject(pf, { ...p, form, updatedAt: new Date().toISOString() });
        emit({ project: pf }, () => out.log(`Updated the questionnaire in ${pf}. Already-printed sheets still scan; the next print uses the new version.`));
        return 0;
      }

      case 'print': {
        const pf = need(pos[0], 'project file');
        let p = loadProject(pf);
        const copies = int(flags, 'copies', 0);
        if (!copies) throw new UserError('How many copies? Add --copies N.');
        if (copies > 2000) throw new UserError('At most 2000 copies per batch.');
        const by = str(flags, 'by');
        if (by && !(p.reservations ?? []).some((r) => r.name === by)) throw new UserError(`No ID range is reserved for "${by}". Use: tallyleaf reserve ${pf} --name "${by}" --count 100`);
        const errors = [...validateForm(p.form), ...lockConflicts(p, p.form)];
        if (errors.length) throw new UserError(`Fix the questionnaire first:\n- ${errors.join('\n- ')}`);
        const bad = await unsupportedChars(p.form);
        if (bad.length && !force) throw new UserError(`These characters would print as "?": ${bad.join(' ')}. Replace them, or add --force to print anyway.`);
        const from = int(flags, 'start', nextFreeSerial(p, by));
        const problem = serialProblem(p, from, from + copies - 1, by);
        if (problem) throw new UserError(`${problem} Next free ID: ${nextFreeSerial(p, by)}.`);
        const layout = await layoutForm(p.form);
        const fv = freezeVersion(p, p.form, layout);
        const { project, batch } = addBatch(fv.project, fv.version.fp, from, copies, by);
        p = { ...project, updatedAt: new Date().toISOString() };
        const duplex = !flags['no-duplex'];
        const target = str(flags, 'out') ?? `${slug(p.form.title)}_${formatSerial(batch.from)}-${formatSerial(batch.to)}.pdf`;
        writeNew(target, await batchPdf(p, fv.version, batch.from, batch.to, duplex), force);
        saveProject(pf, p);
        const pages = layout.pages.length;
        emit({ pdf: target, from: batch.from, to: batch.to, copies, pagesPerCopy: pages, blankBackPages: duplex && pages > 1 && pages % 2 === 1 }, () => {
          out.log(`Wrote ${target}: IDs ${formatSerial(batch.from)}–${formatSerial(batch.to)}, ${copies} copies × ${pages} page(s).`);
          if (duplex && pages > 1 && pages % 2 === 1) out.log('  A blank back page follows each copy so double-sided copies never share a sheet (--no-duplex to skip).');
          out.log('  Print on A4. Each copy is one participant: never photocopy a filled or printed copy for someone else.');
        });
        return 0;
      }

      case 'reserve': {
        const pf = need(pos[0], 'project file');
        const p = loadProject(pf);
        const name = need(str(flags, 'name'), '--name');
        const count = int(flags, 'count', 100);
        if ((p.reservations ?? []).some((r) => r.name === name)) throw new UserError(`"${name}" already has a range.`);
        const end = Math.max(0, ...p.batches.map((b) => b.to), ...(p.reservations ?? []).map((r) => r.to), p.nextSerial - 1);
        const next = addReservation(p, name, end + 1, end + count);
        saveProject(pf, { ...next, updatedAt: new Date().toISOString() });
        emit({ name, from: end + 1, to: end + count }, () => out.log(`Reserved IDs ${formatSerial(end + 1)}–${formatSerial(end + count)} for ${name}. Send them this project file; they print with --by "${name}".`));
        return 0;
      }

      case 'scan': {
        const pf = need(pos[0], 'project file');
        let p = loadProject(pf);
        if (!p.versions.length) throw new UserError('Nothing has been printed from this project yet, so there are no sheets to read.');
        const inputs = collectInputs(pos.slice(1).length ? pos.slice(1) : [need(undefined, 'photos folder or files')]);
        if (!inputs.length) throw new UserError('No images or PDFs found there (JPG, PNG, WebP or PDF).');
        const replace = !!flags.replace;
        const keepEmpty = !!flags['keep-empty'];
        const pages: Record<string, unknown>[] = [];
        for (const file of inputs) {
          for await (const pg of pagesFrom(file)) {
            const rec: Record<string, unknown> = { file: pg.label };
            const say = (kind: '✓' | '!' | '✕', text: string) => { if (!json) out.log(`${kind} ${text}  [${pg.label}]`); };
            if (pg.error || !pg.rgba) { rec.status = 'error'; rec.error = pg.error; say('✕', pg.error ?? 'unreadable'); pages.push(rec); continue; }
            const res = scanPage(pg.rgba, (s) => (s.formId !== p.id
              ? `This sheet was printed from a different project (code ${s.formId}).`
              : p.versions.find((v) => v.fp === s.fp) ?? 'This sheet was printed from a version that is not in this project file.'));
            if (!res.ok) { rec.status = 'error'; rec.error = res.error; say('✕', res.error); pages.push(rec); continue; }
            const who = `ID ${formatSerial(res.sheet.serial)}, page ${res.sheet.page}`;
            Object.assign(rec, { id: res.sheet.serial, page: res.sheet.page });
            if (res.empty && !keepEmpty) { rec.status = 'skipped-empty'; say('!', `${who}: no marks at all, skipped (unused copy?). Use --keep-empty if it really was left blank.`); pages.push(rec); continue; }
            const crops = Object.fromEntries(Object.entries(res.crops).map(([k, g]) => [k, grayToDataUrl(g)]));
            const fields = Object.fromEntries(Object.entries(res.fields).map(([k, f]) => [k, { value: f.value, flag: f.flag }]));
            const r = applyPage(p, { serial: res.sheet.serial, fp: res.sheet.fp, page: res.sheet.page, fields, crops }, replace);
            if (r.status === 'duplicate') { rec.status = 'skipped-duplicate'; say('!', `${who} was already scanned, skipped. If it's another person's sheet (a photocopy), set it aside. Use --replace only to re-scan the same sheet.`); pages.push(rec); continue; }
            if (r.status === 'conflict') { rec.status = 'error'; rec.error = 'same ID from a different questionnaire version'; say('✕', `${who}: this ID was already scanned from a different version. Two sheets share an ID.`); pages.push(rec); continue; }
            p = r.project;
            const list = Object.values(res.fields);
            const toCheck = list.filter((f) => f.flag && !SOFT.has(f.flag)).length;
            const skipped = list.filter((f) => f.flag && SOFT.has(f.flag) && f.flag !== 'text-empty').length;
            Object.assign(rec, { status: r.status, toCheck, skipped });
            say(toCheck ? '!' : '✓', `${who} ${r.status}${toCheck ? ` · ${toCheck} to check` : ''}${skipped ? ` · ${skipped} skipped?` : ''}`);
            pages.push(rec);
          }
        }
        saveProject(pf, p);
        const s = summary(p);
        const count = (st: string) => pages.filter((x) => String(x.status).startsWith(st)).length;
        emit({ pages, read: count('added') + count('replaced'), skipped: count('skipped'), failed: count('error'), status: s }, () => {
          out.log(`\nRead ${count('added') + count('replaced')} · skipped ${count('skipped')} · failed ${count('error')}. ${s.participants} participant(s) on file, ${s.toCheck} answer(s) to check.`);
          if (s.toCheck || s.skipped) out.log(`Next: tallyleaf review ${pf} --crops ./review`);
        });
        return count('error') && !count('added') && !count('replaced') ? 1 : 0;
      }

      case 'status': {
        const p = loadProject(need(pos[0], 'project file'));
        const s = summary(p);
        emit(s, () => {
          out.log(`${s.title}`);
          out.log(`  Printed ${s.printed} copies in ${s.batches} batch(es) · ${s.versions} layout version(s) · next ID ${formatSerial(s.nextId)}`);
          out.log(`  ${s.participants} participant(s) scanned · ${s.toCheck} answer(s) to check · ${s.skipped} skipped answer(s) to confirm`);
          for (const m of s.missingPages) out.log(`  ! ID ${formatSerial(m.id)} is missing page ${m.pages.join(', ')}`);
          for (const c of s.clashes) out.log(`  ! ID ${formatSerial(c.id)} appears on two different sheets (from ${c.from}): tallyleaf clash … ${c.id} --keep mine|theirs|both`);
          for (const r of s.reservations) out.log(`  Reserved: ${r.name} ${formatSerial(r.from)}–${formatSerial(r.to)}`);
        });
        return 0;
      }

      case 'review': {
        const pf = need(pos[0], 'project file');
        const p = loadProject(pf);
        const cropDir = str(flags, 'crops');
        if (cropDir) mkdirSync(cropDir, { recursive: true });
        const fields = allFields(p);
        const items = p.responses.flatMap((r) => fields.filter((f) => r.flags[f.var]).map((f) => {
          const flag = r.flags[f.var];
          const printed = fieldFor(p, r, f.var) ?? f;
          const groupCrop = printed.group ? fields.filter((x) => x.group === printed.group).map((x) => r.crops[x.var]).find(Boolean) : undefined;
          const crop = r.crops[f.var] ?? (flag === 'group-empty' ? groupCrop : undefined);
          let image: string | undefined;
          if (crop && cropDir) {
            image = join(cropDir, `ID${formatSerial(r.serial)}_${f.var}.jpg`);
            writeFileSync(image, dataUrlToBuffer(crop));
          }
          return {
            id: r.serial, column: f.var, flag, meaning: FLAG_MEANING[flag], question: printed.label, page: printed.page,
            current: r.values[f.var] ?? null, options: printed.valueLabels?.map((o) => ({ value: o.value, label: o.label })), image, soft: SOFT.has(flag),
          };
        })).sort((a, b) => Number(a.soft) - Number(b.soft));
        emit({ count: items.length, items }, () => {
          if (!items.length) { out.log('Nothing to check. ✓'); return; }
          for (const it of items) {
            out.log(`ID ${formatSerial(it.id)} · ${it.column} · ${it.flag}: ${it.meaning}`);
            out.log(`   "${it.question}" (page ${it.page}) · read as: ${it.current ?? 'missing'}${it.options ? ` · options: ${it.options.map((o) => `${o.value}=${o.label}`).join(', ')}` : ''}${it.image ? ` · image: ${it.image}` : ''}`);
          }
          out.log(`\n${items.length} to check. Fix with: tallyleaf set ${pf} <ID> column=value …  (or tallyleaf confirm-skipped ${pf})`);
          if (!cropDir) out.log('Tip: add --crops ./review to save an image of each answer.');
        });
        return 0;
      }

      case 'set': {
        const pf = need(pos[0], 'project file');
        const p = loadProject(pf);
        const id = Number(need(pos[1], 'participant ID'));
        const r = p.responses.find((x) => x.serial === id);
        if (!r) throw new UserError(`No scanned participant with ID ${pos[1]}.`);
        const pairs = pos.slice(2);
        if (!pairs.length) throw new UserError('Give at least one column=value.');
        const changes: Record<string, number | string | null> = {};
        for (const kv of pairs) {
          const eq = kv.indexOf('=');
          if (eq < 1) throw new UserError(`"${kv}" should look like column=value.`);
          const col = kv.slice(0, eq);
          const f = fieldFor(p, r, col);
          if (!f) throw new UserError(`ID ${id}'s questionnaire has no column "${col}".`);
          changes[col] = coerce(f, kv.slice(eq + 1));
        }
        saveProject(pf, setAnswers(p, id, changes));
        emit({ id, changes }, () => out.log(`Saved ${Object.entries(changes).map(([k, v]) => `${k}=${v ?? 'missing'}`).join(', ')} for ID ${formatSerial(id)} (logged in corrections).`));
        return 0;
      }

      case 'confirm-skipped': {
        const pf = need(pos[0], 'project file');
        let p = loadProject(pf);
        let n = 0;
        for (const r of p.responses) {
          const changes: Record<string, null> = {};
          for (const [v, f] of Object.entries(r.flags)) if (SOFT.has(f)) { changes[v] = null; n++; }
          if (Object.keys(changes).length) p = setAnswers(p, r.serial, changes);
        }
        saveProject(pf, p);
        emit({ confirmed: n }, () => out.log(`Marked ${n} skipped answer(s) as missing.`));
        return 0;
      }

      case 'delete': {
        const pf = need(pos[0], 'project file');
        const p = loadProject(pf);
        const ids = pos.slice(1).map(Number).filter((n) => Number.isInteger(n));
        if (!ids.length) throw new UserError('Give the participant IDs to delete.');
        const unknown = ids.filter((i) => !p.responses.some((r) => r.serial === i));
        if (unknown.length) throw new UserError(`Not scanned: ${unknown.join(', ')}.`);
        saveProject(pf, deleteResponses(p, ids));
        emit({ deleted: ids }, () => out.log(`Deleted ${ids.length} participant(s). Their sheets can be scanned again later.`));
        return 0;
      }

      case 'merge': {
        const pf = need(pos[0], 'project file');
        const other = need(pos[1], "teammate's project file");
        const { project, report } = mergeProjects(loadProject(pf), loadProject(other), basename(other));
        saveProject(pf, project);
        emit(report, () => {
          out.log(`Merged ${basename(other)}: ${report.addedResponses} new participant(s), ${report.addedBatches} batch(es).`);
          if (report.clashes.length) out.log(`! IDs ${report.clashes.join(', ')} are on two different sheets. Settle each: tallyleaf clash ${pf} <ID> --keep mine|theirs|both`);
          if (report.skippedDeleted.length) out.log(`  ${report.skippedDeleted.length} participant(s) you had deleted stayed deleted.`);
        });
        return 0;
      }

      case 'clash': {
        const pf = need(pos[0], 'project file');
        const p = loadProject(pf);
        const id = Number(need(pos[1], 'participant ID'));
        const keep = need(str(flags, 'keep'), '--keep mine|theirs|both');
        if (!['mine', 'theirs', 'both'].includes(keep)) throw new UserError('--keep must be mine, theirs or both.');
        const idx = (p.clashes ?? []).findIndex((c) => c.serial === id);
        if (idx < 0) throw new UserError(`No clash for ID ${id}.`);
        saveProject(pf, resolveClash(p, idx, keep as 'mine' | 'theirs' | 'both'));
        emit({ id, keep }, () => out.log(`Settled ID ${formatSerial(id)}: kept ${keep}.`));
        return 0;
      }

      case 'export': {
        const p = loadProject(need(pos[0], 'project file'));
        const dir = str(flags, 'out') ?? '.';
        mkdirSync(dir, { recursive: true });
        const formats = (str(flags, 'format') ?? 'xlsx,csv,sps,codebook,corrections').split(',').map((s) => s.trim());
        const name = slug(p.form.title);
        const files: string[] = [];
        const put = (file: string, data: string | Uint8Array) => { const f = join(dir, file); writeFileSync(f, data); files.push(f); };
        for (const fmt of formats) {
          if (fmt === 'xlsx') put(`${name}.xlsx`, toXlsx([{ name: 'Data', table: dataTable(p) }, { name: 'Codebook', table: codebookTable(p) }, { name: 'Corrections', table: correctionsTable(p) }]));
          else if (fmt === 'csv') put(`${name}.csv`, toCsv(dataTable(p)));
          else if (fmt === 'sps') put(`${name}.sps`, spssSyntax(p));
          else if (fmt === 'codebook') put(`${name}_codebook.csv`, toCsv(codebookTable(p)));
          else if (fmt === 'corrections') put(`${name}_corrections.csv`, toCsv(correctionsTable(p)));
          else throw new UserError(`Unknown format "${fmt}". Use xlsx, csv, sps, codebook, corrections.`);
        }
        const s = summary(p);
        emit({ files, participants: s.participants, unchecked: s.toCheck }, () => {
          out.log(`Wrote ${files.join(', ')} (${s.participants} participant(s)).`);
          if (s.toCheck) out.log(`! ${s.toCheck} flagged answer(s) not checked yet: they are exported as the scanner's best guess. See: tallyleaf review`);
          if (formats.includes('sps')) out.log('  SPSS: open the .sps file and choose Run → All (the data is inside the file).');
        });
        return 0;
      }

      case 'gform': {
        const file = need(pos[0], 'questionnaire or project file');
        const { form } = loadForm(file);
        const target = str(flags, 'out') ?? `${slug(form.title)}-google-form.gs`;
        writeNew(target, googleFormScript(form), force);
        emit({ file: target, steps: GFORM_STEPS }, () => {
          out.log(`Wrote ${target}. To turn it into a Google Form:`);
          GFORM_STEPS.forEach((s, i) => out.log(`  ${i + 1}. ${s}`));
        });
        return 0;
      }

      case 'setup-agent': {
        const done: string[] = [];
        if (flags.claude) {
          const dir = join(homedir(), '.claude', 'skills', 'tallyleaf');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'SKILL.md'), guideText);
          done.push(join(dir, 'SKILL.md'));
        }
        if (flags.codex) {
          const file = resolve('AGENTS.md');
          const body = guideText.replace(/^---[\s\S]*?---\s*/, '');
          const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
          if (!current.includes('# Tallyleaf for AI agents')) appendFileSync(file, `${current ? '\n\n' : ''}${body}`);
          done.push(file);
        }
        if (!done.length) throw new UserError('Choose --claude (Claude Code skill) and/or --codex (AGENTS.md in this folder).');
        emit({ files: done }, () => out.log(`Installed the Tallyleaf guide: ${done.join(', ')}`));
        return 0;
      }

      default:
        throw new UserError(`Unknown command "${cmd}". Run "tallyleaf help".`);
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (json) out.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else out.err(`Error: ${msg}`);
    if (!(e instanceof UserError) && !json && process.env.TALLYLEAF_DEBUG) out.err((e as Error).stack ?? '');
    return 1;
  }
}

const HELP = `tallyleaf ${APP_VERSION}: paper questionnaires → spreadsheet, offline

Usage: tallyleaf <command> [options]      (add --json to any command for machine-readable output)

Build
  init [questionnaire.yaml]                 Write a starter questionnaire (every block type)
  check <questionnaire.yaml|study>          Validate; show pages per copy and columns
  preview <file> [-o preview.pdf]           Preview PDF (no IDs used)
  new <questionnaire.yaml> [-o study.tallyleaf]
  form <study> [-o questionnaire.yaml]      Questionnaire of a project, as YAML
  update <study> <questionnaire.yaml>       Replace the questionnaire
  gform <questionnaire.yaml|study> [-o x.gs]  Google Form version (Apps Script)

Print
  print <study> --copies N [--start ID] [--by NAME] [--no-duplex] [-o batch.pdf]
  reserve <study> --name NAME --count N     Give a teammate their own ID range

Scan & check
  scan <study> <photos folder or files…> [--replace] [--keep-empty]
  status <study>
  review <study> [--crops DIR]              Answers to check (+ an image of each)
  set <study> <ID> col=value …              value = code, number, text, or "missing"
  confirm-skipped <study>                   All "nothing marked" flags → missing
  delete <study> <ID…>
  merge <study> <other.tallyleaf>
  clash <study> <ID> --keep mine|theirs|both

Export
  export <study> [-o DIR] [--format xlsx,csv,sps,codebook,corrections]

Agents
  guide                                     Full guide for AI agents (Claude Code, Codex, …)
  setup-agent --claude | --codex            Install the guide as a Claude Code skill / into ./AGENTS.md

Project files (.tallyleaf) also open on the website: https://deepanshutomar.in/tallyleaf/`;

const isMain = process.argv[1] && /tallyleaf(\.js)?$|cli[\\/]main/.test(process.argv[1]);
if (isMain) run(process.argv.slice(2)).then((code) => process.exit(code));
