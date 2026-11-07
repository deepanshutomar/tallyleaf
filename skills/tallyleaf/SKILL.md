---
name: tallyleaf
description: Design printable paper research questionnaires (bubble/OMR sheets) and turn photos or scans of the filled sheets into Excel, SPSS and CSV data, fully offline with the `tallyleaf` command. Use when the user wants to create a survey or questionnaire for paper data collection, print numbered copies, scan or read filled questionnaires, check flagged answers, or export questionnaire data for analysis.
---

# Tallyleaf for AI agents

Tallyleaf is a local, offline command-line tool. It does the same thing as the Tallyleaf website, with no GUI:

1. **Build**: you write a questionnaire file (YAML) from the user's research.
2. **Print**: `tallyleaf print` makes an A4 PDF of numbered copies (each page has an ID, a QR code and corner squares).
3. **Scan**: the user photographs filled sheets into a folder; `tallyleaf scan` reads them (any order, any mix of participants and pages).
4. **Data**: you check flagged answers, then `tallyleaf export` writes Excel / CSV / SPSS / codebook files.

Everything stays on the user's computer. Add `--json` to any command for machine-readable output.

The `.tallyleaf` project file is the same format the website uses: the user can also open it at https://deepanshutomar.in/tallyleaf/ (Open project file) to review answers visually.

## Quick workflow

```bash
tallyleaf init questionnaire.yaml                         # starter file with every block type (GAD-7 example)
# … edit questionnaire.yaml from the user's research …
tallyleaf check questionnaire.yaml                        # validate: errors, pages per copy, columns
tallyleaf preview questionnaire.yaml -o preview.pdf       # look before printing (no IDs used up)
tallyleaf new questionnaire.yaml -o study.tallyleaf       # create the project file
tallyleaf print study.tallyleaf --copies 40 -o batch-1.pdf
# … user prints, collects, photographs the sheets into ./photos …
tallyleaf scan study.tallyleaf ./photos                   # reads every image/PDF in the folder
tallyleaf status study.tallyleaf
tallyleaf review study.tallyleaf --crops ./review         # flagged answers + one image per flag
tallyleaf set study.tallyleaf 17 gad3=2 comments="Felt fine"   # fix answers after looking
tallyleaf export study.tallyleaf -o ./export              # xlsx, csv, sps, codebook, corrections
```

Every command that changes the project file first writes a backup next to it (`study.tallyleaf.bak`).

## Questionnaire file format

```yaml
title: Student Wellbeing Survey
subtitle: Department of Psychology · 2026          # optional line under the title
blocks:
  - text: Thank you for taking part. Your answers are anonymous.
  - heading: About you
  - number: age                                   # column name
    question: Age (in years)
    digits: 2                                     # 1–8 digit bubbles; keep_zeros: true for codes like 007
  - single: gender
    question: Gender
    options: {1: Woman, 2: Man, 3: Non-binary, 9: Prefer not to say}
  - single: year
    question: Year of study
    options: [1st, 2nd, 3rd, Postgraduate]        # stored as 1, 2, 3, 4  (add "start: 0" to begin at 0)
  - multi: relax                                  # tick all that apply → relax_1 … relax_n (1 = ticked, 0 = not)
    question: What do you do to relax?
    options: [Exercise, Music, Friends, None of these]
  - heading: GAD-7
  - scale:                                        # rating grid: statements × scale points
      title: Over the last 2 weeks, how often have you been bothered by the following problems?
      options: frequency-0-3                      # preset, or a list (see below)
      subscale: gad7                              # adds gad7_sum, gad7_mean, gad7_n to the export
      items:
        - gad1: Feeling nervous, anxious, or on edge
        - gad2: Not being able to stop or control worrying
  - pagebreak                                     # optional: force a new page
  - scale:
      title: How much do you agree with each statement?
      options: agree-5
      items:
        - { name: study1, text: I plan my study time in advance., subscale: study }
        - { name: study2, text: I find it hard to concentrate when I study., reverse: true, subscale: study }
  - open: comments                                # lined box; handwriting is typed in later from the photo
    question: Is there anything else you would like to tell us?
    lines: 4
```

**Options** can be:
- a preset: `agree-5`, `agree-4`, `agree-7`, `frequency-5`, `frequency-0-3`, `intensity-5`, `truefalse-4`, `yes-no`;
- a list of labels, stored as 1, 2, 3 … (or from `start:`);
- explicit codes: `{1: Never, 2: Sometimes, 9: Prefer not to say}` or `["0 = Not at all", "3 = Nearly every day"]`.

**Rules** (`tallyleaf check` enforces them):
- Column names start with a letter and use only letters, digits and `_` (no spaces or hyphens), max 64 characters. Not SPSS reserved words (`all and by eq ge gt le lt ne not or to with`). Not `serial`, `version`, `pages_missing`, `unresolved_flags`.
- Subscale names follow the same rules (max 59 characters).
- A rating scale or single choice can have up to 10 options, each stored as a different number.
- Reverse-scored items stay raw in the data; they are only flipped inside the `_sum` / `_mean` scores.
- Only Latin characters print correctly for now (no Hindi yet). `check` lists anything that would print as "?".

## Commands

| Command | What it does |
|---|---|
| `tallyleaf init [file]` | Write a starter questionnaire (`questionnaire.yaml`) |
| `tallyleaf check <questionnaire.yaml \| study.tallyleaf>` | Validate; show pages per copy and the columns |
| `tallyleaf preview <file> [-o preview.pdf]` | Preview PDF, no IDs used |
| `tallyleaf new <questionnaire.yaml> [-o study.tallyleaf]` | Create a project |
| `tallyleaf form <study.tallyleaf> [-o questionnaire.yaml]` | Export the project's questionnaire as YAML |
| `tallyleaf update <study.tallyleaf> <questionnaire.yaml>` | Replace the questionnaire (questions already printed keep their column names and codes) |
| `tallyleaf print <study> --copies N [--start ID] [--by NAME] [--no-duplex] [-o batch.pdf]` | Numbered PDF; IDs continue from the last batch |
| `tallyleaf reserve <study> --name NAME --count N` | Give a teammate their own ID range |
| `tallyleaf scan <study> <files or folders…> [--replace] [--keep-empty]` | Read photos (JPG/PNG/WebP) and scanner PDFs |
| `tallyleaf status <study>` | Printed, scanned, answers to check, missing pages, clashes |
| `tallyleaf review <study> [--all] [--crops DIR]` | List answers to check; `--crops` saves an image of each |
| `tallyleaf set <study> <ID> col=value …` | Correct answers (`value` = a code, a number, text, or `missing`) |
| `tallyleaf confirm-skipped <study>` | Mark every "nothing marked" flag as missing |
| `tallyleaf delete <study> <ID…>` | Remove participants (they can be scanned again later) |
| `tallyleaf merge <study> <other.tallyleaf>` | Combine a teammate's file |
| `tallyleaf clash <study> <ID> --keep mine\|theirs\|both` | Settle two sheets that share an ID |
| `tallyleaf export <study> [-o DIR] [--format xlsx,csv,sps,codebook,corrections]` | Write the data files |
| `tallyleaf gform <questionnaire.yaml \| study> [-o form.gs]` | Google Form version (Apps Script with step-by-step instructions inside) |
| `tallyleaf guide` | Print this guide |
| `tallyleaf setup-agent --claude \| --codex` | Install this guide for Claude Code (skill) or Codex (AGENTS.md) |

## How to behave as an agent

- **Draft, then confirm.** Write the questionnaire from the user's research, run `check` and `preview`, and summarise it (sections, items, scales, columns, pages per copy) before printing. Ask how many copies to print.
- **Don't invent published scales.** Use items the user provides or that are freely usable (e.g. PHQ-9, GAD-7). Many scales (BDI-II, STAI and others) are copyrighted; ask the user to supply the licensed items.
- **Keep codes consistent.** Once printed, a question's column name and codes are locked. To change a scale, add a new question with a new column name.
- **Scanning.** Results per page: `read`, `read · N to check`, `skipped` (duplicate or blank page) or an error with the reason (e.g. a corner square not visible). Tell the user which photos to retake.
- **Reviewing flags.** Run `review --crops DIR`, then **look at each image** before deciding:
  - `faint`, `multiple`, `unclear`: choose the intended option, or `missing`.
  - `blank`: nothing marked; usually `missing` (or use `confirm-skipped` for all).
  - `group-empty`: nothing ticked in a tick-all question. Set every `col_k=0` for "none apply", or every `col_k=missing` for "skipped".
  - `text`: transcribe the handwriting exactly; `text-empty`: confirm it is empty (`col=missing`) or transcribe.
  Every change is written to the corrections log, which is exported with the data.
- **Privacy.** Project files contain participants' answers and images of their handwriting. Keep them local; don't paste their contents into other services.
- Use `--json` whenever you need to parse output.

## Installing

```bash
npm install -g github:deepanshutomar/tallyleaf    # needs Node.js 20.19+ (nodejs.org)
tallyleaf --version
tallyleaf setup-agent --claude                    # optional: makes this guide a Claude Code skill
```
