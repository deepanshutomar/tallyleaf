// Writes AGENTS.md from the agent manual (skills/tallyleaf/SKILL.md) so every agent reads the same instructions.
import { readFileSync, writeFileSync } from 'node:fs';

const manual = readFileSync(new URL('../skills/tallyleaf/SKILL.md', import.meta.url), 'utf8').replace(/^---[\s\S]*?---\s*/, '');
const dev = `

---

## Developing Tallyleaf (only when changing this repository)

- The website is a React + Vite app in \`src/\`. The engine (layout, PDF, scanner, exports) lives in \`src/lib/\` and is shared with the command-line tool in \`cli/\`.
- \`npm test\` runs every test. \`npm run build\` builds the website (\`dist/\`) and the CLI (\`bin/tallyleaf.js\`).
- \`bin/tallyleaf.js\` is committed so \`npm install -g github:deepanshutomar/tallyleaf\` works without a build step. After changing \`cli/\` or \`src/lib/\`, run \`npm run build:cli\` and commit the new file.
- Project files (\`.tallyleaf\`) must stay compatible between the website and the CLI.
- Edit the agent manual in \`skills/tallyleaf/SKILL.md\`. This file (AGENTS.md) is generated from it by \`npm run build:cli\`; don't edit it by hand.
`;
writeFileSync(new URL('../AGENTS.md', import.meta.url), `<!-- Generated from skills/tallyleaf/SKILL.md by scripts/sync-agents.mjs. Edit that file instead. -->\n\n${manual.trimEnd()}${dev}`);
