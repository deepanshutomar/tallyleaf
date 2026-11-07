import { expect, it } from 'vitest';
import { exampleProject } from '../src/lib/example';
import { googleFormScript } from '../src/lib/gform';

it('builds a Google Apps Script that creates every question', () => {
  const p = exampleProject();
  const src = googleFormScript(p.form);
  const calls: string[] = [];
  const item = (kind: string): any => new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(`${kind}.${String(k)}:${JSON.stringify(a).slice(0, 60)}`); return item(kind); } });
  const FormApp = { create: (t: string) => { calls.push(`create:${t}`); return new Proxy({}, { get: (_t, k) => (k === 'getEditUrl' || k === 'getPublishedUrl' ? () => 'url' : () => { calls.push(String(k)); return item(String(k)); }) }); }, createTextValidation: () => item('validation') };
  const logs: string[] = [];
  new Function('FormApp', 'Logger', `${src}\ncreateForm();`)(FormApp, { log: (m: string) => logs.push(m) });
  expect(calls[0]).toBe('create:Student Wellbeing Survey');
  expect(calls.filter((c) => c === 'addGridItem')).toHaveLength(2);
  expect(calls.filter((c) => c === 'addMultipleChoiceItem')).toHaveLength(2);
  expect(calls.filter((c) => c === 'addCheckboxItem')).toHaveLength(1);
  expect(calls.filter((c) => c === 'addTextItem')).toHaveLength(1);
  expect(calls.filter((c) => c === 'addParagraphTextItem')).toHaveLength(1);
  expect(src).toContain('HOW TO TURN THIS FILE INTO A GOOGLE FORM');
  expect(src).toContain('gad1, gad2');
  expect(logs).toHaveLength(2);
});
