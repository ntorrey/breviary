// Assembles one Hour of the Liturgy of the Hours for a date.
//
// Every element of an Hour (hymn, antiphons, psalms, reading, ...) is a named
// FIELD. For each field we build a CHAIN of content entries to look in, in
// order, following the General Instruction of the Liturgy of the Hours (GILH):
//
//   Proper of Saints (saints/<id>)  ->  Commons (commons/<id>)
//   Proper of Time  (time/<season>/w<n>/<day>)  ->  Sunday of that week
//   Four-Week Psalter (psalter/w<n>/<day>)
//
// Which links appear, and in which order, depends on the rank of the day
// (solemnity, feast, memorial, weekday). The first entry that has the field
// wins. If none has it, a "missing" block records every place we looked,
// which doubles as a to-do list when importing the new translation.

import { getDay, getEvening } from '../calendar/index.js';
import { fromIso } from '../calendar/dates.js';

export const HOURS = [
  { id: 'inv', name: 'Invitatory' },
  { id: 'or', name: 'Office of Readings' },
  { id: 'mp', name: 'Morning Prayer' },
  { id: 'terce', name: 'Midmorning Prayer' },
  { id: 'sext', name: 'Midday Prayer' },
  { id: 'none', name: 'Midafternoon Prayer' },
  { id: 'ep', name: 'Evening Prayer' },
  { id: 'np', name: 'Night Prayer' },
];
export const HOUR_NAMES = Object.fromEntries(HOURS.map((h) => [h.id, h.name]));

const DAYTIME = new Set(['terce', 'sext', 'none']);
const PSALMODY = new Set(['ant1', 'ps1', 'ant2', 'ps2', 'ant3', 'ps3']);
// Fields a memorial takes from its proper or common (GILH 235).
const MEMORIAL_PROPER = new Set(['invitatory_ant', 'hymn', 'reading', 'responsory', 'reading2', 'resp2',
  'benedictus_ant', 'magnificat_ant', 'intercessions', 'prayer']);
// Fields a weekday takes from the preceding Sunday when it has none of its own.
const SUNDAY_INHERIT = { or: new Set(['prayer']), mp: new Set(['prayer']), ep: new Set(['prayer']), ep2: new Set(['prayer']) };

const ALL_FIELDS = ['invitatory_ant', 'hymn', ...PSALMODY, 'verse', 'reading1', 'resp1', 'reading2', 'resp2',
  'reading', 'responsory', 'benedictus_ant', 'magnificat_ant', 'nunc_ant', 'intercessions', 'prayer'];

/** Build the context that decides where each field comes from. */
export function buildContext(iso, hour, settings = {}) {
  let day = getDay(iso, settings);
  let isEP1 = false;
  let nightKey = null;
  if (hour === 'ep' || hour === 'np') {
    const ev = getEvening(iso, settings);
    if (hour === 'ep' && ev.kind === 'ep1') { day = ev.day; isEP1 = true; }
    if (hour === 'np') {
      const c = day.celebration;
      if (ev.kind === 'ep1') nightKey = 'sat'; // Night Prayer after Evening Prayer I
      else if (day.temporal.isSunday || c.rank === 'solemnity') nightKey = 'sun';
      else nightKey = day.temporal.dow;
    }
  }
  const t = day.temporal;
  return {
    iso, hour, day, isEP1, nightKey, settings,
    cel: day.celebration,
    commemoration: hour === 'ep' && isEP1 ? null : day.commemoration,
    temporal: t,
    season: t.season,
    psalterBase: `psalter/w${day.psalterWeek}/${t.dow}`,
  };
}

function slotsFor(ctx) {
  const h = ctx.hour;
  if (h === 'np') return [''];
  if (DAYTIME.has(h)) return [h, 'daytime'];
  if (h === 'ep') {
    if (ctx.isEP1) return ['ep1'];
    return ctx.cel.hasFirstVespers || ctx.temporal.isSunday ? ['ep2', 'ep'] : ['ep'];
  }
  return [h];
}

/** The ordered list of content entries (without slot) to search for a field. */
export function chainFor(ctx, field) {
  const { cel, temporal, hour } = ctx;
  if (hour === 'np') return [`night/${ctx.nightKey}`, 'night/common'];

  const T = temporal.key;
  const P = ctx.psalterBase;
  const TS = temporal.sundayKey && temporal.sundayKey !== T && SUNDAY_INHERIT[hour]?.has(field) ? [temporal.sundayKey] : [];
  const isPsalmody = PSALMODY.has(field);
  const daytime = DAYTIME.has(hour);
  const great = cel.rank === 'solemnity' || cel.rank === 'feast';

  if (cel.source === 'temporal') {
    const chain = [T, ...TS];
    if (isPsalmody && great) {
      if (hour === 'mp') chain.push('psalter/w1/sun');
      if (daytime && cel.rank === 'solemnity') chain.push('psalter/complementary');
    }
    chain.push(P);
    return chain;
  }

  const S = cel.key;
  const C = cel.commons.map((c) => `commons/${c}`);
  if (great) {
    if (!isPsalmody) return [S, ...C, T, ...TS, P];
    if (hour === 'mp') return [S, ...C, 'psalter/w1/sun'];
    if (daytime) return [S, ...C, cel.rank === 'solemnity' ? 'psalter/complementary' : P];
    if (hour === 'inv') return [S, ...C];
    return [S, ...C];
  }
  // Memorials (and chosen optional memorials).
  if (daytime) return [T, ...TS, P];
  if (isPsalmody) return [S, T, P];
  if (MEMORIAL_PROPER.has(field)) return [S, ...C, T, ...TS, P];
  return [T, ...TS, P];
}

function variantsFor(ctx, field) {
  const v = [`${field}@${ctx.day.sundayCycle}`, `${field}@${ctx.day.weekdayCycle}`, `${field}@${ctx.season}`, field];
  return v;
}

/** Every entry key this hour could possibly read, so the store can preload them. */
export function entryKeysFor(ctx) {
  const keys = new Set(['ordinary', 'psalms/x', 'canticles/x']);
  const slots = slotsFor(ctx);
  const chains = ALL_FIELDS.map((f) => chainFor(ctx, f));
  if (ctx.commemoration) chains.push([ctx.commemoration.key, ...ctx.commemoration.commons.map((c) => `commons/${c}`)]);
  for (const chain of chains) {
    for (const base of chain) for (const s of slots) keys.add(s ? `${base}/${s}` : base);
  }
  return [...keys];
}

function lookup(ctx, store, field, chain = chainFor(ctx, field), slots = slotsFor(ctx)) {
  const tried = [];
  for (const base of chain) {
    for (const s of slots) {
      const key = s ? `${base}/${s}` : base;
      tried.push(`${key} → ${field}`);
      const entry = store.get(key);
      if (!entry) continue;
      for (const f of variantsFor(ctx, field)) {
        const v = entry[f];
        if (v !== undefined && v !== null && v !== '') return { value: v, key, field: f, base };
      }
    }
  }
  return { missing: true, tried };
}

function ordinary(ctx, store, field) {
  const entry = store.get('ordinary') || {};
  for (const f of variantsFor(ctx, field)) if (entry[f]) return { value: entry[f], key: 'ordinary', field: f };
  return { missing: true, tried: [`ordinary → ${field}`] };
}

const textOf = (v) => (typeof v === 'string' ? v : v?.text ?? '');

function marianSeason(ctx) {
  const d = fromIso(ctx.iso);
  const m = d.getUTCMonth() + 1, dd = d.getUTCDate();
  if (ctx.season === 'easter') return 'easter';
  if (ctx.season === 'advent' || ctx.season === 'christmas' || (m === 1) || (m === 2 && dd <= 2)) return 'advent';
  if (ctx.season === 'lent' || ctx.season === 'triduum' || m === 2 || m === 3) return 'lent';
  return 'ordinary';
}

function wantsTeDeum(ctx) {
  const { cel, temporal, season } = ctx;
  if (season === 'lent' || season === 'triduum') return cel.rank === 'solemnity' || cel.rank === 'feast';
  return temporal.isSunday || cel.rank === 'solemnity' || cel.rank === 'feast' || !!temporal.octave;
}

/**
 * Assemble an Hour. Returns { title, subtitle, blocks }.
 * Blocks: { k: 'heading'|'rubric'|'text'|'antiphon'|'psalm'|'reading'|'missing', ... }
 */
export async function assembleHour(iso, hour, settings, store) {
  const ctx = buildContext(iso, hour, settings);
  await store.ensure(entryKeysFor(ctx));
  const showSources = !!settings.showSources;
  const blocks = [];
  const add = (b) => blocks.push(b);
  const missing = (label, r) => add({ k: 'missing', label, tried: r.tried });
  const src = (r) => (showSources && r.key ? `${r.key} · ${r.field}` : undefined);

  const field = (f, label, kind = 'text', opts = {}) => {
    const r = opts.chain ? lookup(ctx, store, f, opts.chain) : lookup(ctx, store, f);
    if (r.missing) { if (!opts.optional) missing(label, r); return null; }
    if (kind === 'reading') {
      const v = r.value;
      add({ k: 'reading', label, ref: v.ref, author: v.author, title: v.title, text: textOf(v), src: src(r) });
    } else if (kind === 'antiphon') {
      add({ k: 'antiphon', label, text: easterAlleluia(ctx, r, textOf(r.value)), src: src(r) });
    } else {
      if (opts.heading !== false) add({ k: 'heading', text: label });
      add({ k: 'text', text: textOf(r.value), src: src(r) });
    }
    return r;
  };

  const ord = (f, heading) => {
    const r = ordinary(ctx, store, f);
    if (heading) add({ k: 'heading', text: heading });
    if (r.missing) return missing(heading || f, r);
    add({ k: 'text', text: textOf(r.value), src: src(r) });
  };

  const psalmFrom = (r, label, { hideTitle = false } = {}) => {
    let v = r.value;
    let ref = typeof v === 'string' ? v.trim() : v.ref;
    let entry = typeof v === 'object' && v.text ? v : null;
    if (!entry && ref && /^(psalms|canticles)\//.test(ref)) entry = store.get(ref);
    if (!entry) return missing(`${label} (${ref || 'text'})`, { tried: [`${ref || '?'} (referenced from ${r.key} → ${r.field})`] });
    const title = hideTitle ? null : (typeof v === 'object' && v.title) || entry.title;
    add({ k: 'psalm', title, subtitle: entry.subtitle, text: textOf(entry), src: src(r) });
    if (!entry.no_gloria && !(typeof v === 'object' && v.no_gloria)) {
      const g = ordinary(ctx, store, 'gloria');
      if (!g.missing) add({ k: 'text', text: textOf(g.value), cls: 'gloria' });
    }
  };

  const psalmody = (n, optionalFrom = 99) => {
    add({ k: 'heading', text: 'Psalmody' });
    for (let i = 1; i <= n; i++) {
      const optional = i >= optionalFrom;
      const ant = lookup(ctx, store, `ant${i}`);
      const ps = lookup(ctx, store, `ps${i}`);
      if (optional && ant.missing && ps.missing) continue;
      const label = `Ant. ${n > 1 ? i : ''}`.trim();
      const antText = ant.missing ? null : easterAlleluia(ctx, ant, textOf(ant.value));
      if (ant.missing) missing(`Antiphon ${i}`, ant); else add({ k: 'antiphon', label, text: antText, src: src(ant) });
      if (ps.missing) missing(`Psalm ${i}`, ps); else psalmFrom(ps, `Psalm ${i}`);
      if (antText) add({ k: 'antiphon', label: 'Ant.', text: antText, repeat: true });
    }
  };

  // The heading is the canticle's own title in the chosen translation when it
  // has one (e.g. "Canticum Simeonis"), so it isn't printed twice.
  const gospelCanticle = (antField, canticleKey, title) => {
    add({ k: 'heading', text: store.get(canticleKey)?.title || title });
    const ant = lookup(ctx, store, antField);
    const antText = ant.missing ? null : textOf(ant.value);
    if (ant.missing) missing('Antiphon', ant); else add({ k: 'antiphon', label: 'Ant.', text: antText, src: src(ant) });
    psalmFrom({ value: canticleKey, key: 'ordinary', field: canticleKey }, title, { hideTitle: true });
    if (antText) add({ k: 'antiphon', label: 'Ant.', text: antText, repeat: true });
  };

  const commemoration = () => {
    const c = ctx.commemoration;
    if (!c) return;
    const chain = [c.key, ...c.commons.map((x) => `commons/${x}`)];
    add({ k: 'heading', text: `Commemoration: ${c.title}` });
    add({ k: 'rubric', text: 'Optional. On privileged weekdays a memorial may be kept as a commemoration (GILH 239).' });
    if (hour === 'or') {
      field('reading2', 'Hagiographical Reading', 'reading', { chain, optional: false });
      field('resp2', 'Responsory', 'text', { chain });
    } else {
      field(hour === 'mp' ? 'benedictus_ant' : 'magnificat_ant', 'Ant.', 'antiphon', { chain });
    }
    field('prayer', 'Prayer', 'text', { chain });
  };

  // ---- Hour structures ----
  const intro = () => ord(hour === 'inv' ? 'intro_inv' : 'intro', null);
  switch (hour) {
    case 'inv': {
      intro();
      field('invitatory_ant', 'Ant.', 'antiphon');
      const ps = settings.invitatoryPsalm || '95';
      psalmFrom({ value: `canticles/invitatory-${ps}`, key: 'ordinary', field: 'invitatory' }, `Psalm ${ps}`);
      break;
    }
    case 'or':
      add({ k: 'rubric', text: 'If the Office of Readings is the first Hour of the day, it begins with the Invitatory.' });
      intro();
      field('hymn', 'Hymn');
      psalmody(3);
      field('verse', 'Verse');
      field('reading1', 'First Reading', 'reading');
      field('resp1', 'Responsory');
      field('reading2', 'Second Reading', 'reading');
      field('resp2', 'Responsory');
      commemoration();
      if (wantsTeDeum(ctx)) ord('te_deum', 'Te Deum');
      field('prayer', 'Prayer');
      ord('conclusion');
      break;
    case 'mp':
    case 'ep': {
      intro();
      field('hymn', 'Hymn');
      psalmody(3);
      field('reading', 'Reading', 'reading');
      field('responsory', 'Responsory');
      if (hour === 'mp') gospelCanticle('benedictus_ant', 'canticles/benedictus', 'Canticle of Zechariah');
      else gospelCanticle('magnificat_ant', 'canticles/magnificat', 'Canticle of Mary');
      field('intercessions', 'Intercessions');
      ord('our_father', 'The Lord’s Prayer');
      field('prayer', 'Concluding Prayer');
      if (hour === 'mp' || !ctx.isEP1) commemoration();
      ord('dismissal', 'Dismissal');
      break;
    }
    case 'terce':
    case 'sext':
    case 'none':
      intro();
      field('hymn', 'Hymn');
      psalmody(3);
      field('reading', 'Reading', 'reading');
      field('verse', 'Verse');
      field('prayer', 'Prayer');
      ord('conclusion');
      break;
    case 'np':
      intro();
      ord('examen', 'Examination of Conscience');
      field('hymn', 'Hymn');
      psalmody(2, 2);
      field('reading', 'Reading', 'reading');
      field('responsory', 'Responsory');
      gospelCanticle('nunc_ant', 'canticles/nunc-dimittis', 'Canticle of Simeon');
      field('prayer', 'Concluding Prayer');
      ord('blessing', 'Blessing');
      ord(`marian@${marianSeason(ctx)}`, 'Antiphon of the Blessed Virgin Mary');
      break;
    default:
      throw new Error(`Unknown hour ${hour}`);
  }

  const hourName = hour === 'ep' && ctx.isEP1 ? 'Evening Prayer I' : HOUR_NAMES[hour];
  return {
    title: hourName,
    subtitle: ctx.isEP1 ? `of ${ctx.cel.title}` : ctx.cel.title,
    ctx,
    blocks,
  };
}

// During the Easter season, psalter antiphons that have no Easter form of
// their own take "alleluia" (GILH 272).
function easterAlleluia(ctx, r, text) {
  if (ctx.season !== 'easter' || !text || !r.key?.startsWith('psalter/') || r.field.includes('@')) return text;
  if (/alleluia/i.test(text)) return text;
  return text.replace(/[.!?;:,]?\s*$/, ', alleluia.');
}
