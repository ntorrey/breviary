#!/usr/bin/env node
// Compiles content-src/**/*.txt into the JSON shards the app loads (content/).
// Usage: npm run build:content
// Folders whose name starts with "_" (e.g. content-src/_skeleton) are skipped.

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
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

const files = await walk(SRC);
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

// Check that psalm/canticle references point at something.
for (const [k, entry] of Object.entries(all)) {
  for (const [field, v] of Object.entries(entry)) {
    if (!/^ps\d/.test(field)) continue;
    const ref = typeof v === 'string' ? v.trim() : v.ref;
    if (ref && /^(psalms|canticles)\//.test(ref) && !all[ref]) warnings.push(`${k} → ${field}: references ${ref}, which has no text yet`);
  }
}

const shards = {};
for (const [k, v] of Object.entries(all)) {
  const p = shardPrefix(k);
  (shards[p] ||= {})[k] = v;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const hash = createHash('sha1');
const index = { version: '', built: new Date().toISOString(), shards: {} };
for (const [prefix, entries] of Object.entries(shards).sort()) {
  const file = `${prefix.replace(/\//g, '-')}.json`;
  const json = JSON.stringify({ entries });
  hash.update(json);
  await writeFile(join(OUT, file), json);
  index.shards[prefix] = file;
}
index.version = hash.digest('hex').slice(0, 12);
await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log(`Built ${Object.keys(all).length} entries from ${files.length} source files into ${Object.keys(shards).length} shards (version ${index.version}).`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 200)) console.log('  ' + w);
  if (warnings.length > 200) console.log(`  ... and ${warnings.length - 200} more`);
}
