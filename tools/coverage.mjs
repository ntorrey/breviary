#!/usr/bin/env node
// Reports how much of the Office can be assembled from the text loaded so far.
// It walks every day and every Hour of the chosen year(s), assembles it exactly
// as the app does, and lists what is missing, ranked by how many Hours it affects.
//
// Usage: npm run coverage                 (current year, USA calendar)
//        npm run coverage -- 2027 2028    (specific years)
//        npm run coverage -- --region=general

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assembleHour, HOURS } from '../js/office/assemble.js';
import { toIso } from '../js/calendar/dates.js';
import { nodeStore, ROOT } from './lib/node-store.mjs';

const args = process.argv.slice(2);
const region = (args.find((a) => a.startsWith('--region=')) || '--region=usa').split('=')[1];
const years = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
if (!years.length) years.push(new Date().getFullYear());

const store = await nodeStore();
let total = 0, filled = 0;
const gaps = new Map(); // first place looked -> { label, count, example }

for (const y of years) {
  for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d = new Date(d.getTime() + 86400000)) {
    const iso = toIso(d);
    for (const h of HOURS) {
      const office = await assembleHour(iso, h.id, { region }, store);
      for (const b of office.blocks) {
        if (!['text', 'antiphon', 'psalm', 'reading', 'missing'].includes(b.k) || b.repeat) continue;
        total++;
        if (b.k !== 'missing') { filled++; continue; }
        const sig = b.tried.join(' | ');
        const g = gaps.get(sig) || { label: b.label, tried: b.tried, count: 0, example: `${iso} ${h.name}` };
        g.count++;
        gaps.set(sig, g);
      }
    }
  }
}

const pct = total ? ((filled / total) * 100).toFixed(1) : '0';
const sorted = [...gaps.values()].sort((a, b) => b.count - a.count);
const lines = [
  `# Text coverage — ${years.join(', ')} (${region})`, '',
  `Generated ${new Date().toISOString()}. Content version ${store.stats().version}.`, '',
  `**${filled} of ${total} text elements present (${pct}%).** ${sorted.length} distinct gaps.`, '',
  'Each gap lists the places the app looked, in order. Filling *any* of them closes the gap;',
  'usually the last one (the most general source, e.g. the psalter or a common) is the right place.', '',
  '| Hours affected | Missing | Looked in (first → last) | Example |',
  '|---:|---|---|---|',
  ...sorted.map((g) => `| ${g.count} | ${g.label} | ${g.tried.map((t) => `\`${t}\``).join(' → ')} | ${g.example} |`),
];
await mkdir(join(ROOT, 'reports'), { recursive: true });
const file = join(ROOT, 'reports', `coverage-${years.join('-')}-${region}.md`);
await writeFile(file, lines.join('\n') + '\n');
console.log(`${filled}/${total} elements present (${pct}%). ${sorted.length} distinct gaps.`);
console.log(`Report: ${file}`);
