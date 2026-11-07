# Tallyleaf: notes for AI agents

- **Using Tallyleaf** (making questionnaires, printing, scanning, exporting): read [`skills/tallyleaf/SKILL.md`](skills/tallyleaf/SKILL.md), or run `tallyleaf guide`.
- **Working on this repository:**
  - The website is a React + Vite app in `src/`; the engine (layout, PDF, scanner, exports) is in `src/lib/` and is shared with the command-line tool in `cli/`.
  - `npm test` runs every test. `npm run build` builds the website (`dist/`) and the CLI (`bin/tallyleaf.js`, which is committed so `npm install -g github:deepanshutomar/tallyleaf` works without a build step). Run `npm run build:cli` after changing `cli/` or `src/lib/` and commit the new `bin/tallyleaf.js`.
  - Project files (`.tallyleaf`) must stay compatible between the website and the CLI.
