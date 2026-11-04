import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleHour, buildContext, chainFor, HOURS } from '../js/office/assemble.js';
import { ContentStore } from '../js/content/store.js';

// In-memory store with a few entries, independent of the real content folder.
function memStore(entries) {
  const s = new ContentStore(async () => ({}));
  for (const [k, v] of Object.entries(entries)) s.entries.set(k, v);
  s.ensure = async () => {};
  return s;
}

const US = { region: 'usa' };

test('weekday takes psalmody from the psalter week', () => {
  const ctx = buildContext('2026-11-03', 'mp', US); // Tue, Week 31, psalter week 3
  assert.deepEqual(chainFor(ctx, 'ant1'), ['time/ordinary/w31/tue', 'psalter/w3/tue']);
  assert.deepEqual(chainFor(ctx, 'prayer'), ['time/ordinary/w31/tue', 'time/ordinary/w31/sun', 'psalter/w3/tue']);
});

test('memorial: proper/common for hymn, weekday for psalms', () => {
  const ctx = buildContext('2026-11-04', 'mp', US); // Charles Borromeo
  assert.deepEqual(chainFor(ctx, 'hymn').slice(0, 2), ['saints/charles-borromeo', 'commons/pastors']);
  assert.deepEqual(chainFor(ctx, 'ps1'), ['saints/charles-borromeo', 'time/ordinary/w31/wed', 'psalter/w3/wed']);
  assert.deepEqual(chainFor(buildContext('2026-11-04', 'sext', US), 'hymn'), ['time/ordinary/w31/wed', 'psalter/w3/wed']);
});

test('solemnity: Sunday Week 1 psalms at Morning Prayer, complementary psalmody at daytime', () => {
  const mp = buildContext('2026-11-01', 'mp', US); // All Saints (Sunday)
  assert.equal(mp.cel.id, 'all-saints');
  assert.deepEqual(chainFor(mp, 'ps1'), ['saints/all-saints', 'psalter/w1/sun']);
  assert.deepEqual(chainFor(buildContext('2026-11-01', 'sext', US), 'ps1'), ['saints/all-saints', 'psalter/complementary']);
});

test('Evening Prayer I uses the ep1 slot of the following day', async () => {
  const store = memStore({ 'time/advent/w1/sun/ep1': { hymn: 'Advent hymn' } });
  const r = await assembleHour('2026-11-28', 'ep', US, store);
  assert.equal(r.title, 'Evening Prayer I');
  assert.match(r.subtitle, /First Sunday of Advent/);
  assert.ok(r.blocks.some((b) => b.k === 'text' && b.text === 'Advent hymn'));
});

test('missing text reports every place searched', async () => {
  const r = await assembleHour('2026-11-03', 'mp', US, memStore({}));
  const hymn = r.blocks.find((b) => b.k === 'missing' && b.label === 'Hymn');
  assert.deepEqual(hymn.tried, ['time/ordinary/w31/tue/mp → hymn', 'psalter/w3/tue/mp → hymn']);
});

test('variants: Sunday cycle and Easter alleluia', async () => {
  const store = memStore({
    'psalter/w2/sun/mp': { 'benedictus_ant@A': 'Year A antiphon', benedictus_ant: 'Generic', ant1: 'Praise the Lord.' },
  });
  const r = await assembleHour('2026-04-12', 'mp', US, store); // Second Sunday of Easter, psalter week 2
  const ants = r.blocks.filter((b) => b.k === 'antiphon').map((b) => b.text);
  assert.ok(ants.includes('Year A antiphon'));
  assert.ok(ants.includes('Praise the Lord, alleluia.'));
});

test('every hour assembles for a full year without throwing', async () => {
  const store = memStore({});
  for (let m = 1; m <= 12; m++) {
    for (const dd of [1, 8, 15, 22]) {
      const iso = `2027-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      for (const h of HOURS) await assembleHour(iso, h.id, US, store);
    }
  }
});
