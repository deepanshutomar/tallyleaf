import type { FormDef } from './schema';

const q = (s: string | string[]) => JSON.stringify(s);

/** Step-by-step instructions shown in the app and written at the top of the script. */
export const GFORM_STEPS = [
  'Go to script.google.com and sign in with the Google account that should own the form.',
  'Click “New project” (top left).',
  'Delete everything in the editor, then paste the whole script (or open the downloaded .gs file in a text editor and copy all of it).',
  'Click the Save icon (the floppy disk). Next to the “Debug” button, make sure “createForm” is selected, then click “Run”.',
  'Google asks for permission: click “Review permissions”, choose your account. If it says “Google hasn’t verified this app”, click “Advanced”, then “Go to Untitled project (unsafe)”. It is your own script, so this is safe. Click “Allow”.',
  'Wait a few seconds. The “Execution log” at the bottom shows two links: one to edit the form, one to send to participants. The form is also in your Google Drive.',
];

/**
 * A Google Apps Script that recreates the questionnaire as a Google Form.
 * Google Forms has no import file, so a script that builds the form is the reliable route.
 */
export function googleFormScript(form: FormDef): string {
  const lines: string[] = [];
  const add = (s: string) => lines.push(`  ${s}`);
  for (const b of form.blocks) {
    switch (b.kind) {
      case 'heading':
        add(`form.addSectionHeaderItem().setTitle(${q(b.text)});`);
        break;
      case 'text':
        add(`form.addSectionHeaderItem().setTitle(' ').setHelpText(${q(b.text)});`);
        break;
      case 'pagebreak':
        add('form.addPageBreakItem();');
        break;
      case 'likert':
        add(`// Tallyleaf columns ${b.items.map((i) => i.varName).join(', ')}; stored as ${b.options.map((o) => `${o.value}=${o.label}`).join(', ')}` +
          (b.items.some((i) => i.reverse) ? `; reverse-scored: ${b.items.filter((i) => i.reverse).map((i) => i.varName).join(', ')}` : ''));
        add(`form.addGridItem().setTitle(${q(b.title || 'Please answer each statement')}).setHelpText('Choose one answer in each row.')`);
        add(`  .setRows(${q(b.items.map((i) => i.text))})`);
        add(`  .setColumns(${q(b.options.map((o) => o.label))});`);
        break;
      case 'single':
        add(`// Tallyleaf column ${b.varName}; stored as ${b.options.map((o) => `${o.value}=${o.label}`).join(', ')}`);
        add(`form.addMultipleChoiceItem().setTitle(${q(b.text)}).setChoiceValues(${q(b.options.map((o) => o.label))});`);
        break;
      case 'multi':
        add(`// Tallyleaf columns ${b.options.map((_, i) => `${b.varName}_${i + 1}`).join(', ')} (1 = ticked)`);
        add(`form.addCheckboxItem().setTitle(${q(b.text)}).setChoiceValues(${q(b.options)});`);
        break;
      case 'number':
        add(`// Tallyleaf column ${b.varName}`);
        add(`form.addTextItem().setTitle(${q(b.text)}).setValidation(FormApp.createTextValidation()`);
        add(`  .setHelpText(${q(`Numbers only, up to ${b.digits} digits.`)}).requireTextMatchesPattern(${q(`[0-9]{1,${b.digits}}`)}).build());`);
        break;
      case 'open':
        add(`// Tallyleaf column ${b.varName}`);
        add(`form.addParagraphTextItem().setTitle(${q(b.text)});`);
        break;
    }
  }
  const steps = GFORM_STEPS.map((s, i) => ` *   ${i + 1}. ${s}`).join('\n');
  return `/**
 * ${form.title || 'Questionnaire'}: Google Form version, made with Tallyleaf.
 *
 * HOW TO TURN THIS FILE INTO A GOOGLE FORM (about 5 minutes, no coding needed):
${steps}
 *
 * GOOD TO KNOW
 *   - Running the script again makes a second, separate copy of the form.
 *   - Google Forms saves answers as words (e.g. "Agree"), not numbers. The comments
 *     above each question below list the numbers Tallyleaf uses, so you can recode
 *     the Google Sheets responses the same way as your paper data.
 *   - Rating scales become "multiple-choice grids", the closest Google Forms has to a
 *     paper rating table. Reverse-scored items are listed in the comments.
 *   - You can edit everything afterwards in Google Forms as usual.
 */
function createForm() {
  var form = FormApp.create(${q(form.title || 'Questionnaire')});
  form.setDescription(${q(form.subtitle || '')});
${lines.join('\n')}
  Logger.log('Edit your form here: ' + form.getEditUrl());
  Logger.log('Send this link to participants: ' + form.getPublishedUrl());
}
`;
}
