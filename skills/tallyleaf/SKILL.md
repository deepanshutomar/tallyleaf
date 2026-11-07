---
name: tallyleaf
description: Design printable paper research questionnaires (bubble/OMR sheets) and turn photos or scans of the filled sheets into Excel, SPSS and CSV data, fully offline with the `tallyleaf` command. Use when the user wants to create a survey or questionnaire for paper data collection, print numbered copies, scan or read filled questionnaires, check flagged answers, merge teammates' scans, or export questionnaire data for analysis.
---

# Tallyleaf for AI agents

This file is the complete instruction manual for AI agents (Claude Code, Codex, Cursor, Gemini CLI, ChatGPT and others). **Follow it exactly. Do not guess commands, flags, file formats or output fields: everything you need is written here.** If something is not covered, run `tallyleaf help`, `tallyleaf schema` or ask the user. Never invent behaviour.

---

## 1. What Tallyleaf is

Tallyleaf turns paper questionnaires into analysis-ready data. It is a local, offline command-line tool (`tallyleaf`) and a website (https://deepanshutomar.in/tallyleaf/) that share one engine and one project file format (`.tallyleaf`).

The workflow always has four stages:

| Stage | You (the agent) do | Tallyleaf produces |
|---|---|---|
| 1. Build | Write `questionnaire.yaml` from the user's research | A validated project file `study.tallyleaf` |
| 2. Print | Run `tallyleaf print` | A PDF of numbered copies (one copy = one participant) |
| 3. Scan | Run `tallyleaf scan` on the folder of photos/scans | Every answer read; unclear ones flagged |
| 4. Data | Resolve flags, then `tallyleaf export` | Excel, CSV, SPSS, codebook, corrections log |

How it works:
- Every printed page carries four black corner squares, a QR code (project, layout version, participant ID, page) and the printed ID (`ID 00017`). That is why pages can be photographed **in any order**.
- Bubble positions are stored in the project file at print time. The scanner never has to guess the layout.
- All processing is local. Nothing is uploaded. No API keys, accounts or internet needed.

---

## 2. Installation and check

```bash
node --version                                   # must be 20.19 or newer; otherwise ask the user to install Node.js LTS from nodejs.org
npm install -g github:deepanshutomar/tallyleaf   # installs the `tallyleaf` command
tallyleaf --version                              # prints: tallyleaf <version>
```

If `tallyleaf` is "not found" after installing, use `npx github:deepanshutomar/tallyleaf <command>` instead. Never try to re-implement Tallyleaf yourself.

Optional, makes these instructions permanent for an agent:
```bash
tallyleaf setup-agent --claude    # Claude Code: installs this file as a skill (~/.claude/skills/tallyleaf/SKILL.md)
tallyleaf setup-agent --codex     # Codex & others: appends this file to ./AGENTS.md
```

---

## 3. Standard procedure (follow in order)

Recommended folder layout inside the user's research folder:
```
tallyleaf/
  questionnaire.yaml     # you write this
  study.tallyleaf        # the project (never edit by hand)
  prints/                # PDFs to print
  photos/                # the user puts photos/scans of filled sheets here
  review/                # images of answers to check
  export/                # final data files
```

**Step 1: Understand the study.** From the user's research documents or conversation, collect: title, sections, every question/item text, response scales and their numeric codes, which items are reverse-scored, subscales, demographics. If any of these is unclear, **ask**. Do not make up items.

**Step 2: Write the questionnaire file.** Start from `tallyleaf init tallyleaf/questionnaire.yaml` (a commented example of every block type) or write it directly following section 4. Run `tallyleaf schema` if you need the formal JSON Schema.

**Step 3: Validate.**
```bash
tallyleaf check tallyleaf/questionnaire.yaml --json
```
Fix every reported problem and run `check` again until `"ok": true`. Read `warnings` (e.g. characters that can't print).

**Step 4: Preview and confirm with the user.** ⚠️ **Checkpoint.**
```bash
tallyleaf preview tallyleaf/questionnaire.yaml -o tallyleaf/prints/preview.pdf
```
Tell the user: number of sections, questions, columns, subscales, reverse-scored items and pages per copy, and where the preview PDF is. **Ask them to look at it and confirm.** Ask how many copies to print.

**Step 5: Create the project and print.**
```bash
tallyleaf new tallyleaf/questionnaire.yaml -o tallyleaf/study.tallyleaf --json
tallyleaf print tallyleaf/study.tallyleaf --copies <N> -o tallyleaf/prints/batch-1.pdf --json
```
Tell the user to print on A4, one copy per participant, never photocopy a copy for someone else, and that participants should fill circles with a dark pen.

**Step 6: Scan.** ⚠️ **Checkpoint:** wait until the user says the photos/scans are in the folder.
```bash
tallyleaf scan tallyleaf/study.tallyleaf tallyleaf/photos --json
```
Report: pages read, skipped (and why), failed (and the reason for each file). Tell the user exactly which photos to retake and how (see section 6).

**Step 7: Resolve flagged answers.**
```bash
tallyleaf review tallyleaf/study.tallyleaf --crops tallyleaf/review --json
```
For each item, **open its `image` file and look at it** (you can read images), then decide using section 7, and apply:
```bash
tallyleaf set tallyleaf/study.tallyleaf <ID> <column>=<value> [<column>=<value> …] --json
```
If you cannot tell from the image, ask the user. Never guess an answer to make data look complete; use `missing`.

**Step 8: Export.**
```bash
tallyleaf status tallyleaf/study.tallyleaf --json      # confirm toCheck is 0 and no missingPages/clashes are left unexplained
tallyleaf export tallyleaf/study.tallyleaf -o tallyleaf/export --json
```
Tell the user which files were written and how to open them (section 9).

---

## 4. Questionnaire file format (YAML or JSON)

Top level:

| Key | Required | Meaning |
|---|---|---|
| `title` | yes | Printed at the top of every page; also names output files |
| `subtitle` | no | Smaller line under the title (department, study name, date) |
| `blocks` | yes | List of blocks, printed top to bottom in this order |

Block types (each list item is exactly one of these):

```yaml
blocks:
  # Section heading
  - heading: About you

  # Paragraph: instructions, consent text, thank-you
  - text: Thank you for taking part. Your answers are anonymous.

  # Force a new page
  - pagebreak

  # Single choice (pick one) → 1 column
  - single: gender                      # column name
    question: Gender
    options: {1: Woman, 2: Man, 3: Non-binary, 9: Prefer not to say}

  # Tick all that apply → columns relax_1 … relax_n (1 = ticked, 0 = not ticked)
  - multi: relax
    question: What do you do to relax? (tick all that apply)
    options: [Exercise, Music, Friends, None of these]

  # Number (digit bubbles) → 1 numeric column
  - number: age
    question: Age (in years)
    digits: 2                           # 1–8; default 2
    keep_zeros: false                   # true = store as text so 007 stays "007" (participant codes)

  # Open answer (lined box; handwriting is transcribed during review) → 1 text column
  - open: comments
    question: Is there anything else you would like to tell us?
    lines: 4                            # 1–20; default 3

  # Rating scale (Likert grid): statements down the side, scale points across → 1 column per item
  - scale:
      title: How much do you agree with each statement?
      options: agree-5
      subscale: selfesteem              # optional default for all items → selfesteem_sum, selfesteem_mean, selfesteem_n
      items:
        - se1: I feel good about myself.                       # short form: column: text
        - { name: se2, text: At times I feel useless., reverse: true }
        - { name: se3, text: I am satisfied with my life., subscale: wellbeing }   # per-item subscale override
```

### Options (for `single` and `scale`)

| Form | Example | Stored codes |
|---|---|---|
| Preset | `options: agree-5` | see table below |
| Plain list | `options: [Never, Sometimes, Often]` | 1, 2, 3 (or from `start: 0` → 0, 1, 2) |
| Explicit list | `options: ["0 = Not at all", "3 = Nearly every day"]` | as written |
| Map | `options: {1: Woman, 2: Man, 9: Prefer not to say}` | as written |
| Objects | `options: [{value: 0, label: No}, {value: 1, label: Yes}]` | as written |

Presets:

| Preset | Codes and labels |
|---|---|
| `agree-5` | 1 Strongly disagree · 2 Disagree · 3 Neutral · 4 Agree · 5 Strongly agree |
| `agree-4` | 1 Strongly disagree · 2 Disagree · 3 Agree · 4 Strongly agree |
| `agree-7` | 1 Strongly disagree · 2 Disagree · 3 Somewhat disagree · 4 Neutral · 5 Somewhat agree · 6 Agree · 7 Strongly agree |
| `frequency-5` | 1 Never · 2 Rarely · 3 Sometimes · 4 Often · 5 Always |
| `frequency-0-3` | 0 Not at all · 1 Several days · 2 More than half the days · 3 Nearly every day |
| `intensity-5` | 1 Not at all · 2 A little · 3 Moderately · 4 Quite a bit · 5 Extremely |
| `truefalse-4` | 1 Definitely false · 2 Mostly false · 3 Mostly true · 4 Definitely true |
| `yes-no` | 1 Yes · 0 No |

**Match the published scoring of an instrument.** E.g. PHQ-9/GAD-7 use 0–3 (`frequency-0-3`); many scales use 1–5. If unsure, ask the user.

### Rules (enforced by `tallyleaf check`)

- **Column and subscale names:** start with a letter; only letters, digits and `_`; no spaces or hyphens; max 64 characters (subscales max 59). They must be unique (case-insensitive).
- **Forbidden names:** SPSS reserved words `all and by eq ge gt le lt ne not or to with`, and `serial`, `version`, `pages_missing`, `unresolved_flags`. A column may not equal `<subscale>_sum`, `_mean` or `_n`.
- **Options:** 2–10 per `single`/`scale`; codes must all be different integers. `multi` needs at least 2 options (consider adding "None of these").
- **At least one question block.** Headings, text and page breaks alone are not a questionnaire.
- **Characters:** only Latin script prints correctly for now. Hindi, Chinese, emoji, ✓ ≤ ≥ and similar print as "?"; `check` lists them as a warning and `print` refuses them unless `--force`. Replace them (e.g. "<=" instead of "≤").
- **Paper:** always A4. Layout is automatic: you never position anything. Long scales continue onto the next page with a repeated header.
- **Reverse-scored items** are stored raw (as marked). They are flipped only inside `_sum`/`_mean` (as min + max − value).
- **Copyright:** do not reproduce copyrighted instruments (e.g. BDI-II, STAI, many commercial scales) from memory. Use items the user provides, or instruments known to be free to use (e.g. PHQ-9, GAD-7). When in doubt, ask.

### Editing after printing

Once copies are printed, the column names and stored codes of printed questions are **locked** (old and new sheets must mean the same thing). You may fix typos in text, add new questions, or remove questions. To change a printed scale, add a new question with new column names. Use:
```bash
tallyleaf form tallyleaf/study.tallyleaf -o tallyleaf/questionnaire.yaml   # get the current version
# edit…
tallyleaf update tallyleaf/study.tallyleaf tallyleaf/questionnaire.yaml
```
The next `print` uses a new layout version automatically; sheets of every version scan into the same data.

---

## 5. Command reference

Global behaviour:
- Add `--json` to **any** command to get exactly one JSON object on stdout: `{"ok": true, …}` or `{"ok": false, "error": "…"}`. Always use `--json` when you need to read results.
- Exit code `0` = success, `1` = error (`scan` returns `1` only if nothing at all could be read).
- Every command that changes a project file first copies it to `<file>.bak`.
- `init`, `new`, `form -o`, `print` and `gform` refuse to overwrite an existing file unless `--force` is given. `preview`, `export` and `review --crops` overwrite their output files.
- Paths are relative to the current directory.

| Command | Arguments / options | JSON fields on success |
|---|---|---|
| `tallyleaf init [file]` | default `questionnaire.yaml`; `--force` | `file` |
| `tallyleaf check <questionnaire.yaml \| study.tallyleaf>` | | `title`, `pagesPerCopy`, `columns[]`, `subscales[]`, `warnings[]` |
| `tallyleaf preview <file> [-o out.pdf]` | default `<title>-preview.pdf` | `file`, `pages` |
| `tallyleaf new <questionnaire.yaml> [-o study.tallyleaf]` | default `<title>.tallyleaf`; `--force` | `project`, `id` |
| `tallyleaf form <study> [-o questionnaire.yaml]` | without `-o`: YAML to stdout (or `yaml` field with `--json`) | `file` or `yaml` |
| `tallyleaf update <study> <questionnaire.yaml>` | refuses changes to printed codes/columns | `project` |
| `tallyleaf print <study> --copies N` | `--start ID` (default: next free), `--by NAME` (teammate range), `--no-duplex`, `-o file.pdf` (default `<title>_<from>-<to>.pdf`), `--force` (print unsupported characters) | `pdf`, `from`, `to`, `copies`, `pagesPerCopy`, `blankBackPages` |
| `tallyleaf reserve <study> --name NAME --count N` | gives a teammate their own ID range | `name`, `from`, `to` |
| `tallyleaf scan <study> <files or folders…>` | `--replace` (overwrite pages already scanned: only for re-scanning the same sheet), `--keep-empty` (keep pages with no marks) | `pages[]`, `read`, `skipped`, `failed`, `status` |
| `tallyleaf status <study>` | | `title`, `printed`, `batches`, `versions`, `participants`, `toCheck`, `skipped`, `missingPages[]`, `clashes[]`, `reservations[]`, `nextId` |
| `tallyleaf review <study> [--crops DIR]` | `--crops` saves `ID00017_<column>.jpg` per item | `count`, `items[]` |
| `tallyleaf set <study> <ID> col=value …` | value: a code, digits, text (quote it), or `missing` | `id`, `changes` |
| `tallyleaf confirm-skipped <study>` | all `blank`, `group-empty`, `text-empty` → missing | `confirmed` |
| `tallyleaf delete <study> <ID…>` | removes participants; can be re-scanned later | `deleted[]` |
| `tallyleaf merge <study> <other.tallyleaf>` | combine a teammate's file into `<study>` | `addedVersions`, `addedBatches`, `addedResponses`, `clashes[]`, `skippedDeleted[]` |
| `tallyleaf clash <study> <ID> --keep mine\|theirs\|both` | settle two different sheets sharing an ID | `id`, `keep` |
| `tallyleaf export <study> [-o DIR]` | `--format xlsx,csv,sps,codebook,corrections` (default: all) | `files[]`, `participants`, `unchecked` |
| `tallyleaf gform <questionnaire.yaml \| study> [-o file.gs]` | Google Form version (Apps Script) | `file`, `steps[]` |
| `tallyleaf schema` | prints the JSON Schema of the questionnaire file | (prints the schema) |
| `tallyleaf guide` | prints this manual | (prints text) |
| `tallyleaf setup-agent --claude \| --codex` | install this manual for an agent | `files[]` |
| `tallyleaf help`, `tallyleaf --version` | | `version` |

### Detailed JSON shapes

`scan`:
```json
{
  "ok": true,
  "pages": [
    { "file": "IMG_0412.jpg", "status": "added", "id": 17, "page": 1, "toCheck": 1, "skipped": 0 },
    { "file": "scan.pdf · page 3", "status": "skipped-duplicate", "id": 4, "page": 2 },
    { "file": "IMG_0413.jpg", "status": "error", "error": "Couldn't line the page up: the bottom-left black corner square isn't visible. …" }
  ],
  "read": 1, "skipped": 1, "failed": 1,
  "status": { "...": "same object as `status`" }
}
```
`pages[].status` is one of: `added` (new page), `replaced` (with `--replace`), `skipped-empty` (no marks at all), `skipped-duplicate` (this ID + page was already scanned), `error` (see `error`).

`review`:
```json
{
  "ok": true, "count": 2,
  "items": [
    { "id": 17, "column": "gad3", "flag": "multiple", "meaning": "two or more options marked: …", "question": "Worrying too much about different things",
      "page": 1, "current": 2, "options": [{ "value": 0, "label": "Not at all" }, { "value": 1, "label": "Several days" }],
      "image": "tallyleaf/review/ID00017_gad3.jpg", "soft": false },
    { "id": 17, "column": "comments", "flag": "text", "question": "Is there anything else…", "page": 2, "current": null, "image": "…", "soft": false }
  ]
}
```
`current` is the scanner's best guess (what will be exported if you do nothing). `soft: true` marks "nothing was marked" cases, listed after the real problems. `options` is present for single-choice, scale and tick-box columns.

`status.missingPages`: `[{ "id": 12, "pages": [2] }]`, participants with pages not scanned yet. `status.clashes`: `[{ "id": 14, "from": "riya.tallyleaf" }]`.

---

## 6. Scan results: what to tell the user

| Result | Meaning | What to do |
|---|---|---|
| `added` | Page read and filed under its participant | Nothing |
| `added` with `toCheck > 0` | Read, some answers need a human look | Resolve in step 7 |
| `skipped-empty` | Page has no marks at all | Usually an unused copy. If the participant really left that whole page blank, re-run `scan` for that file with `--keep-empty` |
| `skipped-duplicate` | This ID + page was already scanned | If it's the same sheet photographed twice: ignore. If it's a **different person's** sheet with the same ID (photocopy): set it aside and tell the user; never use `--replace` for it |
| error: *corner square isn't visible* | Page couldn't be aligned | Retake: whole page in frame, all 4 black squares visible with a margin, phone held flat above the page |
| error: *Couldn't find the code* | QR code unreadable | Retake: one page per photo, in focus, no glare on the top-right code, not cropped |
| error: *too small to read* | Resolution too low | Move closer / use a higher resolution |
| error: *different project* | Sheet printed from another project file | Use the project file the sheets were printed from |
| error: *version that is not in this project file* | Printed from a newer copy of the project | Get the newer `.tallyleaf` file (or `merge` it) and scan again |
| error: *HEIC photo* | iPhone HEIC format | Convert to JPG (iPhone: Settings → Camera → Formats → Most Compatible) |

Accepted inputs: JPG, PNG and WebP photos, and PDFs from scanners (every page is read). Folders are searched recursively; hidden files and other file types are ignored. HEIC must be converted to JPG first.

---

## 7. Resolving flagged answers

Always look at the `image` before deciding. Then:

| `flag` | Column type | Decide | Command |
|---|---|---|---|
| `faint` | choice / scale | Light mark: was it intended? | `set … col=<code>` or `col=missing` |
| `multiple` | choice / scale | Two+ options marked (often a crossed-out answer + a new one). The intended answer is usually the clearly filled one, not the crossed-out one | `set … col=<code>` or `col=missing` |
| `unclear` | choice / scale / number | Marks hard to tell apart | `set … col=<code or digits>` |
| `blank` | choice / scale / number | Nothing marked: skipped | `set … col=missing` (or the answer if you can see one), or `confirm-skipped` for all at once |
| `faint` | tick box (`col_k`) | Light tick? | `set … col_k=1` or `col_k=0` |
| `group-empty` | tick-all question | Nothing ticked: "none apply" or "skipped"? | none apply: `set … q_1=0 q_2=0 … q_n=0`; skipped: `set … q_1=missing … q_n=missing`. Set **all** columns of the question. Ask the user which interpretation the study uses if unsure |
| `text` | open answer | Handwriting | Transcribe exactly as written (keep spelling): `set … comments="exact text"` |
| `text-empty` | open answer | Box looks empty | Confirm `col=missing`, or transcribe if you see writing |

Values for `set`:
- choice/scale: one of the listed `options[].value` codes (anything else is rejected with the allowed list);
- tick box: `0` or `1`;
- number: digits only (respecting the digit count; leading zeros kept if `keep_zeros`);
- open answer: any text (quote it in the shell);
- any column: `missing`.

Every change is logged (when, ID, column, scanner value, new value, reason) and exported as the corrections log. Report what you changed to the user.

---

## 8. Teams, merging and clashes

- Two people printing from copies of the same project file would print the **same IDs**. Prevent it:
  ```bash
  tallyleaf reserve study.tallyleaf --name Riya --count 100     # Riya gets her own ID range
  tallyleaf print study.tallyleaf --copies 30 --by Riya         # run on Riya's copy
  ```
- Combine a teammate's scans: `tallyleaf merge study.tallyleaf riya.tallyleaf`. Pages of the same participant are joined; nothing is ever dropped.
- If two **different** sheets share an ID, they become a clash (`status.clashes`). Settle each one:
  `tallyleaf clash study.tallyleaf 14 --keep mine|theirs|both` (`both` gives the second sheet a new ID and records the printed one in `original_serial`).
- Deleted participants stay deleted when an older file is merged back in.

---

## 9. Exported data

`tallyleaf export` writes (`<name>` = the title in lowercase with hyphens):

| File | Contents |
|---|---|
| `<name>.xlsx` | Sheets: Data, Codebook, Corrections |
| `<name>.csv` | Data (UTF-8 with BOM; text that looks like a formula is prefixed with `'`; line breaks in text become " / ") |
| `<name>.sps` | Self-contained SPSS syntax: data + variable labels + value labels. In SPSS or PSPP: open it, then Run → All. No other file needed |
| `<name>_codebook.csv` | Every column: label, type, codes, reverse-scored, subscale, page |
| `<name>_corrections.csv` | Every manual change |

Data columns, in order:
- `serial`: the participant ID printed on the sheet (`ID 00017` = 17).
- `original_serial`: only present if a clash was settled with `both`.
- `version`: layout version (1 = first printed).
- `pages_missing`: pages not scanned yet, e.g. `2`.
- Then every question column, in questionnaire order. Choice/scale columns hold codes, tick boxes 0/1, numbers numeric (or text with `keep_zeros`), open answers text. Empty means missing.
- For each subscale: `<sub>_sum` (blank if any item is missing), `<sub>_mean` (mean of answered items), `<sub>_n` (number answered). Reverse-scored items are flipped inside these only.
- `unresolved_flags`: answers still not checked (should be 0 before analysis).

In R: `read.csv("export/<name>.csv")`. For a Google Form version of the same questionnaire: `tallyleaf gform …`, then follow the printed steps (script.google.com → New project → paste → Run → allow).

---

## 10. Common errors and fixes

| Error message contains | Fix |
|---|---|
| `is not a valid …` / `can't be used: start with a letter` | Rename the column/subscale (letters, digits, `_`) |
| `reserved word in SPSS` | Rename, e.g. `to` → `to_1` |
| `is used more than once` | Make column names unique |
| `has two options stored as the same number` | Give every option a different code |
| `unknown preset` | Use a preset from section 4 or list the options |
| `"options" is missing` / `"question" is missing` | Add the missing key |
| `already exists` | Choose another output name or add `--force` (never overwrite a project file without the user's consent) |
| `How many copies?` | Add `--copies N` |
| `were already printed` / `are reserved for` | Leave out `--start` (uses the next free ID) or use the suggested ID |
| `would print as "?"` | Replace those characters, or `--force` if the user accepts "?" |
| `was printed with options stored as` | A printed question's codes changed: undo, or add a new question with new column names |
| `No scanned participant with ID` / `has no column` | Check IDs and column names with `status` / `review` |
| `must be one of …` | Use one of the listed codes, or `missing` |
| `Nothing has been printed from this project yet` | Print first, or use the project file the sheets were printed from |

---

## 11. Rules of conduct for agents

1. **Never fabricate.** Not questionnaire items, not answers, not scan results. If you don't know, ask the user or use `missing`.
2. **Checkpoints with the user:** before printing (show summary + preview, confirm copy count), when scans fail (which photos to retake), and when an answer can't be read from the image.
3. **Don't edit `.tallyleaf` files by hand.** Always use commands. Backups (`.bak`) exist, but don't rely on them.
4. **Privacy:** project files and review images contain participants' answers and handwriting. Keep them local; never upload or paste them into other services.
5. **Always use `--json`** when you parse results; report the outcome to the user in plain words.
6. **Respect locked codes** after printing; never "fix" data by changing codes.
7. The user can open the same project on the website (https://deepanshutomar.in/tallyleaf/ → Open project file) to review answers visually. Suggest it if they prefer clicking to commands.

---

## 12. Worked example

User: *"My study measures exam stress (8 items, 1–5 agreement, items 3 and 6 reversed) plus age, gender and year. Print 60 copies."*

```bash
mkdir -p tallyleaf/prints tallyleaf/photos tallyleaf/review tallyleaf/export
cat > tallyleaf/questionnaire.yaml <<'YAML'
title: Exam Stress Study
subtitle: Department of Psychology · 2026
blocks:
  - text: Thank you for taking part. Your answers are anonymous. Please fill the circles fully with a dark pen.
  - heading: About you
  - number: age
    question: Age (in years)
    digits: 2
  - single: gender
    question: Gender
    options: {1: Woman, 2: Man, 3: Non-binary, 9: Prefer not to say}
  - single: year
    question: Year of study
    options: [1st, 2nd, 3rd, 4th, Postgraduate]
  - heading: Exam stress
  - scale:
      title: How much do you agree with each statement?
      options: agree-5
      subscale: stress
      items:
        - es1: I feel overwhelmed before exams.
        - es2: I lose sleep worrying about exams.
        - { name: es3, text: I stay calm during exams., reverse: true }
        - es4: I find it hard to concentrate when revising.
        - es5: I worry that I will fail.
        - { name: es6, text: I feel well prepared for exams., reverse: true }
        - es7: My heart races during exams.
        - es8: I avoid thinking about upcoming exams.
YAML
tallyleaf check tallyleaf/questionnaire.yaml --json
tallyleaf preview tallyleaf/questionnaire.yaml -o tallyleaf/prints/preview.pdf
```
→ Tell the user: *"1 page per copy; columns age, gender, year, es1–es8; subscale stress (es3 and es6 reverse-scored). Preview: tallyleaf/prints/preview.pdf. Print 60 copies?"*

After confirmation:
```bash
tallyleaf new tallyleaf/questionnaire.yaml -o tallyleaf/study.tallyleaf --json
tallyleaf print tallyleaf/study.tallyleaf --copies 60 -o tallyleaf/prints/batch-1.pdf --json
```
Later, when the photos are in `tallyleaf/photos/`:
```bash
tallyleaf scan tallyleaf/study.tallyleaf tallyleaf/photos --json
tallyleaf review tallyleaf/study.tallyleaf --crops tallyleaf/review --json
# look at each image, then e.g.:
tallyleaf set tallyleaf/study.tallyleaf 23 es4=3 --json
tallyleaf confirm-skipped tallyleaf/study.tallyleaf --json          # only after telling the user
tallyleaf status tallyleaf/study.tallyleaf --json
tallyleaf export tallyleaf/study.tallyleaf -o tallyleaf/export --json
```
→ Tell the user: *"52 participants; 3 answers corrected (see the corrections log); files in tallyleaf/export: exam-stress-study.xlsx, .csv, .sps (open it in SPSS and choose Run → All), codebook, corrections."*
