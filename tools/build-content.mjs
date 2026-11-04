#!/usr/bin/env node
// Compiles the text sources into the JSON shards the app loads.
//
//   content-src/<edition>/edition.json   name, description, order, default, fallback
//   content-src/<edition>/**/*.txt       the text, in the source format
//     ->  content/<edition>/index.json + shards
//     ->  content/editions.json          list of editions for the Settings screen
//
// Each folder in content-src/ that has an edition.json is one edition
// (translation). Folders starting with "_" (e.g. _skeleton) are skipped.
// "fallback": "<other edition>" fills anything this edition lacks from another
// one. That's useful while an edition is only partly loaded.
//
// Usage: npm run build:content

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseSource, shardPrefix } from './lib/source-format.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'content-src');
const OUT = join(ROOT, 'content');

async function walk(dir) {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('_') || d.name.startsWith('.')) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...await walk(p));
    else if (d.name.endsWith('.txt')) out.push(p);
  }
  return out.sort();
}

async function loadEdition(id) {
  const dir = join(SRC, id);
  const meta = JSON.parse(await readFile(join(dir, 'edition.json'), 'utf8'));
  const files = await walk(dir);
  const all = {};
  const warnings = [];
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    const { entries, warnings: w } = parseSource(await readFile(f, 'utf8'), rel);
    warnings.push(...w);
    for (const [k, v] of Object.entries(entries)) {
      if (all[k]) {
        for (const field of Object.keys(v)) if (field in all[k]) warnings.push(`${rel}: ${k} → ${field} also defined in another file (later file wins)`);
        Object.assign(all[k], v);
      } else all[k] = v;
    }
  }
  return { id, meta, files: files.length, entries: all, warnings };
}

const ids = (await readdir(SRC, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(SRC, d.name, 'edition.json')))
  .map((d) => d.name);
const loaded = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadEdition(id)])));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const list = [];

for (const ed of Object.values(loaded)) {
  // Fallback: entries/fields missing here are taken from another edition.
  let entries = ed.entries;
  const fb = ed.meta.fallback && loaded[ed.meta.fallback];
  if (fb && Object.keys(ed.entries).length) {
    entries = structuredClone(fb.entries);
    for (const [k, v] of Object.entries(ed.entries)) entries[k] = { ...(entries[k] || {}), ...v };
  }

  for (const [k, entry] of Object.entries(entries)) {
    for (const [field, v] of Object.entries(entry)) {
      if (!/^ps\d/.test(field)) continue;
      const ref = typeof v === 'string' ? v.trim() : v.ref;
      if (ref && /^(psalms|canticles)\//.test(ref) && !entries[ref]) ed.warnings.push(`${k} → ${field}: references ${ref}, which has no text yet`);
    }
  }

  const shards = {};
  for (const [k, v] of Object.entries(entries)) (shards[shardPrefix(k)] ||= {})[k] = v;
  const dir = join(OUT, ed.id);
  await mkdir(dir, { recursive: true });
  const hash = createHash('sha1');
  const index = { edition: ed.id, version: '', built: new Date().toISOString(), shards: {} };
  for (const [prefix, group] of Object.entries(shards).sort()) {
    const file = `${prefix.replace(/\//g, '-')}.json`;
    const json = JSON.stringify({ entries: group });
    hash.update(json);
    await writeFile(join(dir, file), json);
    index.shards[prefix] = file;
  }
  index.version = hash.digest('hex').slice(0, 12);
  await writeFile(join(dir, 'index.json'), JSON.stringify(index, null, 2));

  const count = Object.keys(entries).length;
  list.push({
    id: ed.id, name: ed.meta.name || ed.id, description: ed.meta.description || '',
    default: !!ed.meta.default, order: ed.meta.order ?? 99, entries: count, version: index.version,
  });
  console.log(`${ed.id}: ${count} entries from ${ed.files} file(s)${fb ? ` (+ fallback ${fb.id})` : ''}, version ${index.version}`);
  if (ed.warnings.length) {
    console.log(`  ${ed.warnings.length} warning(s):`);
    for (const w of ed.warnings.slice(0, 100)) console.log('    ' + w);
    if (ed.warnings.length > 100) console.log(`    ... and ${ed.warnings.length - 100} more`);
  }
}

list.sort((a, b) => a.order - b.order);
await writeFile(join(OUT, 'editions.json'), JSON.stringify({ editions: list }, null, 2));
console.log(`Wrote content/editions.json (${list.length} editions).`);
