#!/usr/bin/env node
// Imports public-domain Bible texts for the two public-domain editions:
//
//   Latin:   Clementine Vulgate, Clementine Text Project (public domain)
//            https://bitbucket.org/clementinetextproject/text
//   English: Douay-Rheims, Challoner revision, Project Gutenberg #8300 (public domain)
//            https://www.gutenberg.org/ebooks/8300
//
// Writes generated source files (do not edit by hand; re-run this instead):
//   content-src/latin/bible.generated.txt
//   content-src/english-pd/bible.generated.txt
// containing: all 150 psalms (keyed by Hebrew numbering, titled with the
// Vulgate number first), a few psalm sections used by Night Prayer, the
// Gospel canticles, the invitatory psalms, and the Night Prayer readings.
//
// Usage: node tools/import-public-domain-bible.mjs <download-folder>
//   The folder receives the downloaded source files (kept apart from the code).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = process.argv[2];
if (!DATA) {
  console.error('Usage: node tools/import-public-domain-bible.mjs <download-folder>');
  process.exit(1);
}

// ---------- Download ----------
const VUL_BOOKS = { Ps: 'Ps', Lc: 'Lc', Dt: 'Dt', Apc: 'Apc', '1Thes': '1Thes', '1Ptr': '1Ptr', Eph: 'Eph', Jr: 'Jr' };
async function download(url, file) {
  const path = join(DATA, file);
  if (existsSync(path)) return path;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} downloading ${url}`);
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
  console.log(`Downloaded ${file}`);
  return path;
}
await mkdir(DATA, { recursive: true });
for (const b of Object.keys(VUL_BOOKS)) {
  await download(`https://bitbucket.org/clementinetextproject/text/raw/master/${b}.lat`, `vul-${b}.lat`);
}
await download('https://www.gutenberg.org/cache/epub/8300/pg8300.txt', 'dr.txt');

// ---------- Parse the Vulgate (Latin-1; "c:v text", "/" = line break, "[" = start of text) ----------
const vul = {};
for (const b of Object.keys(VUL_BOOKS)) {
  const text = new TextDecoder('latin1').decode(await readFile(join(DATA, `vul-${b}.lat`)));
  vul[b] = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d+):(\d+)\s+(.*)$/);
    if (m) (vul[b][+m[1]] ||= {})[+m[2]] = m[3];
  }
}

// ---------- Parse Douay-Rheims ("Book Chapter N" headings; "c:v. text" paragraphs) ----------
// Two quirks are handled here:
//  - The second half of Psalm 9 ("Psalm 10 according to the Hebrews") restarts
//    at verse 1; it is stored as chapter "9b".
//  - Some psalm titles are printed as their own paragraph before verse 1, others
//    inside verse 1. drPrelude[ch] counts the paragraphs between the heading and
//    verse 1 (incipit, summary, and a separate title if there is one).
const dr = {};
const drPrelude = {};
{
  const text = (await readFile(join(DATA, 'dr.txt'), 'utf8')).replace(/\r\n/g, '\n');
  let book = null, ch = null, last = 0, prelude = 0, lastWasShortV1 = false;
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.replace(/\s*\n\s*/g, ' ').trim();
    const h = p.match(/^(.+) Chapter (\d+)$/);
    if (h) { book = h[1]; ch = h[2]; last = 0; prelude = 0; continue; }
    const v = p.match(/^(\d+):(\d+)\.\s+(.*)$/);
    if (book && v) {
      const verse = +v[2];
      if (book === 'Psalms' && verse <= last) ch = `${ch}b`; // numbering restarted
      if (book === 'Psalms' && last === 0 && !ch.endsWith('b')) drPrelude[ch] = prelude;
      last = verse;
      ((dr[book] ||= {})[ch] ||= {})[verse] = v[3];
      lastWasShortV1 = book === 'Psalms' && verse === 1 && v[3].length < 60;
    } else if (book && p) {
      // e.g. Psalm 121: "121:1. A gradual canticle." then the verse text as its own paragraph.
      if (lastWasShortV1 && !/^Ver\. /.test(p)) dr[book][ch][1] += ` ${p}`;
      else prelude++;
      lastWasShortV1 = false;
    }
  }
}
const DR_BOOK = { Ps: 'Psalms', Lc: 'Luke', Dt: 'Deuteronomy', Apc: 'Apocalypse', '1Thes': '1 Thessalonians', '1Ptr': '1 Peter', Eph: 'Ephesians', Jr: 'Jeremias' };

// ---------- Helpers ----------
const cleanLatin = (s) => s.replace(/[[\]\\]/g, '').replace(/\s+([;:?!.,])/g, '$1').replace(/\s+/g, ' ').trim();
// Drop Challoner's bracketed cross-references, e.g. "[2 Kings 17.]".
const cleanEnglish = (s) => s.replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

/** Verses [from..to] of a book chapter, as { latin: [...], english: [...] } (raw). */
function verses(book, ch, from, to) {
  const lat = vul[book][ch], eng = dr[DR_BOOK[book]]?.[ch];
  if (!lat || !eng) throw new Error(`Missing ${book} ${ch}`);
  const last = to ?? Math.max(...Object.keys(lat).map(Number));
  // Where the two number a chapter differently (Douay-Rheims Psalm 115 runs
  // 10-19, the Vulgate 1-10), align by position.
  const minKey = (o) => Math.min(...Object.keys(o).map(Number));
  const offset = minKey(eng) - minKey(lat);
  const out = { latin: [], english: [] };
  for (let v = from; v <= last; v++) {
    if (lat[v] === undefined) continue;
    out.latin.push(lat[v]);
    out.english.push(eng[v + offset] ?? '');
  }
  return out;
}

/**
 * Remove the psalm title (superscription), which the Liturgy of the Hours omits.
 *  - Latin: everything before the first "[" is title.
 *  - If the whole first verse is title, drop it in both versions.
 *  - If the title shares verse 1 with the text: Douay-Rheims sometimes prints it
 *    as its own paragraph (nothing to remove), sometimes inside verse 1; then drop
 *    as many sentences as the Latin title has.
 */
function stripTitle(vs, vgChapter) {
  const first = vs.latin[0] ?? '';
  if (!first.includes('[') && vs.latin.slice(1).some((l) => l.includes('['))) {
    return { latin: vs.latin.slice(1), english: vs.english.slice(1) };
  }
  const cut = first.indexOf('[');
  if (cut > 0) {
    const latinTitle = first.slice(0, cut).trim();
    vs.latin[0] = first.slice(cut);
    const titleSeparate = (drPrelude[vgChapter] ?? 0) >= 3;
    if (!titleSeparate) {
      // Drop up to as many sentences as the Latin title has, but stop if what is
      // left would be too short to translate the Latin text of verse 1
      // (titles don't always have the same number of sentences in both).
      const sentences = (latinTitle.match(/[.](\s|$)/g) || []).length || 1;
      const words = (s) => s.split(/\s+/).filter(Boolean).length;
      const latinWords = words(cleanLatin(vs.latin[0].replace(/\//g, ' ')));
      let eng = cleanEnglish(vs.english[0]);
      for (let i = 0; i < sentences; i++) {
        const next = eng.replace(/^[^.]*\.\s*/, '');
        if (next === eng || words(next) < 0.9 * latinWords) break;
        eng = next;
      }
      vs.english[0] = eng;
    }
  }
  return vs;
}

/** Latin verse -> psalm lines: "/" segments, "*" at the middle. */
function latinPsalmLines(verse) {
  const segs = cleanLatin(verse.replace(/\/\s*$/, '')).split(/\s*\/\s*/).filter(Boolean);
  if (segs.length < 2) return segs;
  const mid = Math.ceil(segs.length / 2) - 1;
  return segs.map((s, i) => `${i ? '  ' : ''}${s}${i === mid ? ' *' : ''}`);
}

/** English verse -> psalm lines: divided at the first colon (Douay-Rheims uses it as the mediant). */
function englishPsalmLines(verse) {
  const v = cleanEnglish(verse);
  const i = v.indexOf(': ');
  if (i < 0 || i > v.length - 4) return [v];
  return [`${v.slice(0, i + 1)} *`, `  ${v.slice(i + 2)}`];
}

// (Empty verses are skipped: in a few places the Douay-Rheims text merges two
// verses under one number.)
const psalmText = (vs) => ({
  latin: vs.latin.filter((v) => v.trim()).flatMap(latinPsalmLines).join('\n'),
  english: vs.english.filter((v) => v.trim()).flatMap(englishPsalmLines).join('\n'),
});
const prose = (vs) => ({
  latin: vs.latin.map((v) => cleanLatin(v.replace(/\//g, ' '))).join(' '),
  english: vs.english.map(cleanEnglish).join(' '),
});

// ---------- Hebrew -> Vulgate psalm numbering ----------
function vulgateParts(heb) {
  if (heb <= 8 || heb >= 148) return [[heb, 1, null]];
  if (heb === 9) return [[9, 1, 21]];
  if (heb === 10) return [[9, 22, null]];
  if (heb <= 113) return [[heb - 1, 1, null]];
  if (heb === 114) return [[113, 1, 8]];
  if (heb === 115) return [[113, 9, null]];
  if (heb === 116) return [[114, 1, null], [115, 1, null]];
  if (heb <= 146) return [[heb - 1, 1, null]];
  return [[146, 1, null], [147, 1, null]]; // 147
}
const vulgateLabel = (heb) => {
  const parts = vulgateParts(heb);
  const nums = [...new Set(parts.map((p) => p[0]))];
  return nums.join('–');
};

function psalm(heb, from = null, to = null) {
  // Hebrew Psalm 10: Vulgate 9:22-39; Douay-Rheims prints it as "9b", restarting at verse 1.
  if (heb === 10) {
    return psalmText({
      latin: verses('Ps', 9, 22, null).latin,
      english: Object.keys(dr.Psalms['9b']).sort((a, b) => a - b).map((v) => dr.Psalms['9b'][v]),
    });
  }
  const vs = { latin: [], english: [] };
  for (const [vg, a, b] of vulgateParts(heb)) {
    let part = verses('Ps', vg, from ?? a, to ?? b);
    // Each Vulgate psalm that starts at its top has a title to strip (Hebrew 115
    // starts mid-psalm at Vulgate 113:9, so it has none).
    if (a === 1 && (from === null || from === 1)) part = stripTitle(part, String(vg));
    vs.latin.push(...part.latin);
    vs.english.push(...part.english);
  }
  return psalmText(vs);
}

// ---------- Build the output ----------
const out = { latin: [], english: [] };
const header = (lang) => `%% GENERATED by tools/import-public-domain-bible.mjs. Do not edit; re-run the tool.
%% Source: ${lang === 'latin'
    ? 'Clementine Vulgate, Clementine Text Project (public domain).'
    : 'Douay-Rheims Bible, Challoner revision, Project Gutenberg #8300 (public domain).'}
%% Psalm keys use Hebrew numbering (psalms/63); titles show the Vulgate number first.
`;
const entry = (key, fields) => {
  for (const lang of ['latin', 'english']) {
    out[lang].push(`=== ${key}`);
    for (const [f, v] of Object.entries(fields)) {
      const val = typeof v === 'string' ? v : v[lang];
      if (val) out[lang].push(`--- ${f}`, val, '');
    }
  }
};

for (let n = 1; n <= 150; n++) {
  const t = psalm(n);
  const vg = vulgateLabel(n);
  entry(`psalms/${n}`, { title: { latin: `Psalmus ${vg} (${n})`, english: `Psalm ${vg} (${n})` }, text: t });
}

// Psalm sections used in Night Prayer (Hebrew numbering).
for (const [heb, a, b] of [[143, 1, 11], [31, 1, 6]]) {
  const vg = vulgateParts(heb)[0][0];
  entry(`psalms/${heb}:${a}-${b}`, {
    title: { latin: `Psalmus ${vg} (${heb}), ${a}-${b}`, english: `Psalm ${vg} (${heb}):${a}-${b}` },
    text: psalm(heb, a, b),
  });
}

// Gospel canticles.
function canticle(key, ch, a, b, titleLa, titleEn, dropIntro) {
  const vs = verses('Lc', ch, a, b);
  if (vs.latin[0].includes('[')) vs.latin[0] = vs.latin[0].slice(vs.latin[0].indexOf('['));
  if (dropIntro) vs.english[0] = vs.english[0].replace(dropIntro, '');
  entry(key, { title: { latin: titleLa, english: titleEn }, text: psalmText(vs) });
}
canticle('canticles/benedictus', 1, 68, 79, 'Canticum Zachariae (Lc 1, 68-79)', 'Canticle of Zachary (Luke 1:68-79)');
canticle('canticles/magnificat', 1, 46, 55, 'Canticum Beatae Mariae Virginis (Lc 1, 46-55)', 'Canticle of the Blessed Virgin Mary (Luke 1:46-55)', /^And Mary said:\s*/);
canticle('canticles/nunc-dimittis', 2, 29, 32, 'Canticum Simeonis (Lc 2, 29-32)', 'Canticle of Simeon (Luke 2:29-32)');

// Invitatory psalms.
for (const heb of [95, 100, 67, 24]) {
  const vg = vulgateLabel(heb);
  entry(`canticles/invitatory-${heb}`, {
    title: { latin: `Psalmus ${vg} (${heb})`, english: `Psalm ${vg} (${heb})` },
    text: psalm(heb),
  });
}

// Night Prayer readings (the same each week).
const NIGHT_READINGS = {
  sat: ['Dt', 6, 4, 7, 'Dt 6, 4-7', 'Deuteronomy 6:4-7'],
  sun: ['Apc', 22, 4, 5, 'Ap 22, 4-5', 'Apocalypse 22:4-5'],
  mon: ['1Thes', 5, 9, 10, '1 Th 5, 9-10', '1 Thessalonians 5:9-10'],
  tue: ['1Ptr', 5, 8, 9, '1 Pt 5, 8-9', '1 Peter 5:8-9'],
  wed: ['Eph', 4, 26, 27, 'Eph 4, 26-27', 'Ephesians 4:26-27'],
  thu: ['1Thes', 5, 23, 23, '1 Th 5, 23', '1 Thessalonians 5:23'],
  fri: ['Jr', 14, 9, 9, 'Ier 14, 9', 'Jeremias 14:9'],
};
for (const [day, [book, ch, a, b, refLa, refEn]] of Object.entries(NIGHT_READINGS)) {
  const t = prose(verses(book, ch, a, b));
  for (const lang of ['latin', 'english']) {
    out[lang].push(`=== night/${day}`, '--- reading', `@ref ${lang === 'latin' ? refLa : refEn}`, t[lang], '');
  }
}

await writeFile(join(ROOT, 'content-src', 'latin', 'bible.generated.txt'), header('latin') + '\n' + out.latin.join('\n') + '\n');
await writeFile(join(ROOT, 'content-src', 'english-pd', 'bible.generated.txt'), header('english') + '\n' + out.english.join('\n') + '\n');
console.log('Wrote content-src/latin/bible.generated.txt and content-src/english-pd/bible.generated.txt');
