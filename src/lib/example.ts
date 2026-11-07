import { SCALE_PRESETS, newProject, uid, type Project } from './schema';

const scale = (name: string) => SCALE_PRESETS.find((s) => s.name === name)!.options.map((o) => ({ ...o }));

export function exampleProject(): Project {
  const p = newProject('Student Wellbeing Survey');
  p.form.subtitle = 'Department of Psychology · Example study';
  const gad = [
    'Feeling nervous, anxious, or on edge',
    'Not being able to stop or control worrying',
    'Worrying too much about different things',
    'Trouble relaxing',
    'Being so restless that it is hard to sit still',
    'Becoming easily annoyed or irritable',
    'Feeling afraid, as if something awful might happen',
  ];
  const study = [
    ['I plan my study time in advance.', false],
    ['I find it hard to concentrate when I study.', true],
    ['I review my notes regularly.', false],
    ['I leave assignments until the last minute.', true],
    ['I ask for help when I do not understand something.', false],
  ] as const;
  p.form.blocks = [
    {
      kind: 'text', id: uid(6),
      text: 'Thank you for taking part. Your answers are anonymous and will be used for research only. There are no right or wrong answers. You may skip any question you prefer not to answer.',
    },
    { kind: 'heading', id: uid(6), text: 'About you' },
    { kind: 'number', id: uid(6), varName: 'age', text: 'Age (in years)', digits: 2 },
    { kind: 'single', id: uid(6), varName: 'gender', text: 'Gender', options: [
      { label: 'Woman', value: 1 }, { label: 'Man', value: 2 }, { label: 'Non-binary', value: 3 }, { label: 'Prefer not to say', value: 9 },
    ] },
    { kind: 'single', id: uid(6), varName: 'year', text: 'Year of study', options: [
      { label: '1st', value: 1 }, { label: '2nd', value: 2 }, { label: '3rd', value: 3 }, { label: 'Postgraduate', value: 4 },
    ] },
    { kind: 'multi', id: uid(6), varName: 'relax', text: 'What do you do to relax? (tick all that apply)', options: ['Exercise', 'Music', 'Friends', 'Gaming', 'Meditation', 'Other'] },
    { kind: 'heading', id: uid(6), text: 'GAD-7' },
    {
      kind: 'likert', id: uid(6),
      title: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
      options: scale('Frequency 0–3'),
      items: gad.map((text, i) => ({ id: uid(6), varName: `gad${i + 1}`, text, subscale: 'gad7' })),
    },
    { kind: 'heading', id: uid(6), text: 'Study habits' },
    {
      kind: 'likert', id: uid(6),
      title: 'How much do you agree with each statement?',
      options: scale('Agreement (5)'),
      items: study.map(([text, reverse], i) => ({ id: uid(6), varName: `study${i + 1}`, text, reverse, subscale: 'study' })),
    },
    { kind: 'open', id: uid(6), varName: 'comments', text: 'Is there anything else you would like to tell us?', lines: 4 },
  ];
  return p;
}
