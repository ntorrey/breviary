// Liturgical calendar engine: combines the Proper of Time with the Proper of
// Saints (general + regional + local), applies the rules of precedence and
// transfer, and reports which celebrations may be chosen on a given day.

import { makeDate, addDays, fromIso, toIso, dow, mmdd, sameDay } from './dates.js';
import { anchors, temporalDay, cycles } from './temporal.js';
import { GENERAL_ROMAN_CALENDAR, MOVABLE_CELEBRATIONS, REGIONS } from './sanctoral-data.js';

export const RANK_LABELS = {
  solemnity: 'Solemnity', feast: 'Feast', memorial: 'Memorial', optional: 'Optional Memorial',
  commemoration: 'Commemoration', sunday: 'Sunday', weekday: 'Weekday', triduum: 'Paschal Triduum',
};

const RANK_CODES = { S: 'solemnity', F: 'feast', M: 'memorial', OM: 'optional' };

/** Calendar options derived from user settings. */
export function calendarConfig(settings = {}) {
  const region = REGIONS[settings.region] ? settings.region : 'usa';
  const opts = REGIONS[region].options;
  return {
    region,
    epiphanySunday: settings.epiphanySunday ?? opts.epiphanySunday,
    ascensionSunday: settings.ascensionSunday ?? opts.ascensionSunday,
    corpusSunday: settings.corpusSunday ?? opts.corpusSunday,
    local: Array.isArray(settings.localCelebrations) ? settings.localCelebrations : [],
  };
}

function rowToEntry(row) {
  const [date, id, title, rank, color, commons = '', flags = ''] = row;
  return { date, id, title, rank, color, commons, flags: flags ? flags.split(',') : [] };
}

/** Merge general, regional and local sanctoral rows into one list. */
function sanctoralEntries(cfg) {
  const region = REGIONS[cfg.region];
  const list = GENERAL_ROMAN_CALENDAR.map(rowToEntry);
  for (const e of list) {
    if (region.move[e.id]) e.date = region.move[e.id];
    if (region.set[e.id]) Object.assign(e, region.set[e.id]);
  }
  list.push(...region.add.map(rowToEntry));
  for (const l of cfg.local) {
    if (!l || !/^\d\d-\d\d$/.test(l.date) || !l.title) continue;
    list.push({
      date: l.date, id: l.id || `local-${l.date}-${slug(l.title)}`, title: l.title,
      rank: RANK_CODES[l.rank] ? l.rank : 'OM', color: l.color || 'white',
      commons: l.commons || '', flags: ['local'], local: true,
    });
  }
  return list;
}

function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

function precedenceOf(e) {
  if (e.rank === 'S') return e.flags.includes('local') ? 4 : 3;
  if (e.rank === 'F') return e.flags.includes('lord') ? 5 : e.flags.includes('local') ? 8 : 7;
  if (e.rank === 'M') return e.flags.includes('local') ? 11 : 10;
  return 12;
}

function sanctoralCelebration(e, iso, extra = {}) {
  const rank = RANK_CODES[e.rank];
  const isSunday = dow(fromIso(iso)) === 0;
  return {
    id: e.id,
    key: `saints/${e.id}`,
    title: e.title,
    rank,
    prec: precedenceOf(e),
    color: e.color,
    source: 'sanctoral',
    commons: e.commons ? e.commons.split(',').map((s) => s.trim()).filter(Boolean) : [],
    lord: e.flags.includes('lord'),
    prevails: e.flags.includes('prevails'),
    hasFirstVespers: !e.flags.includes('allsouls') && (rank === 'solemnity' || (rank === 'feast' && e.flags.includes('lord') && isSunday)),
    ...extra,
  };
}

function temporalCelebration(t) {
  return {
    id: t.key,
    key: t.key,
    title: t.title,
    rank: t.rank,
    prec: t.prec,
    color: t.color,
    source: 'temporal',
    commons: [],
    lord: !!t.lordFeast,
    hasFirstVespers: t.key !== 'time/easter/w1/sun' &&
      (t.isSunday || t.rank === 'solemnity' && !t.key.startsWith('time/easter/w1/')),
  };
}

const yearCache = new Map();

/** Build every day of civil year y. Returns Map<iso, rawDay>. */
export function buildYear(y, cfg) {
  const cacheKey = `${y}|${JSON.stringify(cfg)}`;
  if (yearCache.has(cacheKey)) return yearCache.get(cacheKey);

  const A = anchors(y, cfg);
  const days = new Map();
  for (let d = makeDate(y, 1, 1); d.getUTCFullYear() === y; d = addDays(d, 1)) {
    days.set(toIso(d), { iso: toIso(d), temporal: temporalDay(d, cfg), placed: [] });
  }

  const entries = sanctoralEntries(cfg).map((e) => ({ ...e, dateObj: makeDate(y, +e.date.slice(0, 2), +e.date.slice(3)) }));
  for (const m of MOVABLE_CELEBRATIONS) {
    entries.push({ date: mmdd(A[m.anchor]), dateObj: A[m.anchor], id: m.id, title: m.title, rank: m.rank, color: m.color, commons: m.commons, flags: m.flags || [] });
  }

  // US: when January 22 falls on a Sunday, the Day of Prayer is kept on January 23.
  for (const e of entries) {
    if (e.flags.includes('unborn') && dow(e.dateObj) === 0) e.dateObj = addDays(e.dateObj, 1);
  }

  const fixedFeastDates = new Set(entries.filter((e) => e.rank === 'F').map((e) => toIso(e.dateObj)));
  const hasSolemnity = (iso) => days.get(iso)?.placed.some((p) => p.prec <= 4);
  const impededForSolemnity = (iso) => {
    const day = days.get(iso);
    return !day || day.temporal.prec <= 3 || hasSolemnity(iso);
  };
  const freeForTransfer = (iso) => {
    const day = days.get(iso);
    if (!day) return true; // beyond this year: leave as is
    return day.temporal.prec > 8 && !day.placed.some((p) => p.prec <= 8) && !fixedFeastDates.has(iso);
  };

  // 1. Solemnities, with transfers.
  for (const e of entries.filter((x) => x.rank === 'S').sort((a, b) => a.dateObj - b.dateObj)) {
    let target = e.dateObj;
    let note;
    if (e.id === 'joseph' && target >= A.palmSun && target <= A.holySat) {
      target = addDays(A.palmSun, -1);
      note = 'anticipated (falls in Holy Week)';
    } else if (e.id === 'annunciation' && target >= A.palmSun && target <= A.divineMercy) {
      target = addDays(A.divineMercy, 1);
      note = 'transferred (falls in Holy Week or the Octave of Easter)';
    } else if (impededForSolemnity(toIso(target)) && !e.flags.includes('allsouls')) {
      do { target = addDays(target, 1); } while (!freeForTransfer(toIso(target)));
      note = 'transferred';
    }
    const iso = toIso(target);
    if (!days.has(iso)) continue;
    days.get(iso).placed.push(sanctoralCelebration(e, iso,
      note ? { transferredFrom: toIso(e.dateObj), transferNote: note } : {}));
  }

  // 2. Feasts and memorials (never transferred).
  for (const e of entries.filter((x) => x.rank !== 'S')) {
    const iso = toIso(e.dateObj);
    if (days.has(iso)) days.get(iso).placed.push(sanctoralCelebration(e, iso));
  }

  // 3. Resolve each day.
  for (const day of days.values()) resolveDay(day);
  yearCache.set(cacheKey, days);
  return days;
}

function resolveDay(day) {
  const t = day.temporal;
  const feria = temporalCelebration(t);
  let principal = feria;
  const higher = day.placed.filter((p) => p.prec <= 8).sort((a, b) => a.prec - b.prec);
  if (higher.length && higher[0].prec < principal.prec) principal = higher[0];

  const lesser = day.placed.filter((p) => p.prec >= 10);
  const options = [];
  const suppressed = [];
  let defaultId = principal.id;

  if (principal.prec <= 8) {
    suppressed.push(...lesser, ...higher.filter((h) => h !== principal));
  } else if (principal.prec === 9) {
    // Privileged weekdays: memorials become optional commemorations.
    options.push(principal, ...lesser.map((m) => ({ ...m, rank: 'commemoration', commemoration: true })));
  } else {
    const obligatory = lesser.filter((m) => m.prec <= 11);
    const prevailing = obligatory.find((m) => m.prevails);
    if (obligatory.length === 1 || prevailing) {
      principal = prevailing || obligatory[0];
      defaultId = principal.id;
      suppressed.push(...lesser.filter((m) => m !== principal));
    } else {
      // Only optional memorials (or several obligatory ones, which then become optional).
      const opts = lesser.map((m) => (m.rank === 'memorial' ? { ...m, rank: 'optional' } : m));
      if (opts.length) {
        options.push(principal, ...opts);
        if (obligatory.length > 1) defaultId = obligatory[0].id;
      }
      if (t.season === 'ordinary' && t.dow === 'sat' && !obligatory.length) {
        if (!options.length) options.push(principal);
        options.push({
          id: 'bvm-saturday', key: 'commons/bvm-saturday', title: 'Saturday Memorial of the Blessed Virgin Mary',
          rank: 'optional', prec: 12, color: 'white', source: 'sanctoral', commons: ['bvm'], hasFirstVespers: false,
        });
      }
    }
  }
  day.principal = principal;
  day.options = options;
  day.defaultId = defaultId;
  day.suppressed = suppressed;
}

/**
 * Everything the app needs to know about one date, after applying the user's
 * choice among optional celebrations.
 */
export function getDay(iso, settings = {}) {
  const cfg = calendarConfig(settings);
  const d = fromIso(iso);
  const raw = buildYear(d.getUTCFullYear(), cfg).get(iso);
  const choiceId = settings.choices?.[iso] ?? raw.defaultId;
  const chosen = raw.options.find((o) => o.id === choiceId) || raw.options.find((o) => o.id === raw.defaultId) || raw.principal;

  let celebration = chosen;
  let commemoration = null;
  if (chosen.commemoration) {
    celebration = raw.options[0];
    commemoration = chosen;
  }
  const t = raw.temporal;
  return {
    iso,
    temporal: t,
    season: t.season,
    psalterWeek: t.psalterWeek,
    ...cycles(t.litYear),
    principal: raw.principal,
    celebration,
    commemoration,
    options: raw.options,
    selectedId: chosen.id,
    suppressed: raw.suppressed,
  };
}

/**
 * Which office is prayed on the evening of `iso`: Evening Prayer (II) of the
 * day, or Evening Prayer I of the following day (GILH 61).
 */
export function getEvening(iso, settings = {}) {
  const today = getDay(iso, settings);
  const tomorrow = getDay(toIso(addDays(fromIso(iso), 1)), settings);
  const a = today.celebration;
  const b = tomorrow.celebration;
  if (b.hasFirstVespers && iso !== holySaturdayIso(iso, settings)) {
    const higher = b.prec < a.prec;
    // A Sunday takes Evening Prayer I over a weekday of equal rank (e.g. the Octave of Easter).
    const sundayOverWeekday = b.prec === a.prec && tomorrow.temporal.isSunday && b.source === 'temporal' && !today.temporal.isSunday && a.source === 'temporal';
    if (higher || sundayOverWeekday) return { kind: 'ep1', day: tomorrow, evening: today };
  }
  return { kind: 'ep', day: today, evening: today };
}

function holySaturdayIso(iso, settings) {
  const cfg = calendarConfig(settings);
  return toIso(anchors(fromIso(iso).getUTCFullYear(), cfg).holySat);
}

/** A whole month of resolved days, for the calendar view. */
export function getMonth(year, month, settings = {}) {
  const out = [];
  for (let d = makeDate(year, month, 1); d.getUTCMonth() === month - 1; d = addDays(d, 1)) {
    out.push(getDay(toIso(d), settings));
  }
  return out;
}

export { sameDay };
