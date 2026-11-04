// The Proper of Time: seasons, weeks, Sundays and the movable celebrations
// of the Lord. Precedence numbers follow the Table of Liturgical Days
// (Universal Norms on the Liturgical Year, no. 59): lower number = higher rank.

import {
  makeDate, addDays, daysBetween, dow, sameDay, sundayOnOrBefore, sundayAfter,
  DOW_KEYS, DOW_NAMES, ordinal, pad2, easterSunday as easterOf,
} from './dates.js';

const anchorCache = new Map();

/** Key dates for civil year y under the given calendar options. */
export function anchors(y, cfg) {
  const ck = `${y}|${cfg.epiphanySunday}|${cfg.ascensionSunday}|${cfg.corpusSunday}`;
  if (anchorCache.has(ck)) return anchorCache.get(ck);
  const easter = easterOf(y);
  const A = {
    easter,
    ashWed: addDays(easter, -46),
    lent1: addDays(easter, -42),
    palmSun: addDays(easter, -7),
    holyThu: addDays(easter, -3),
    goodFri: addDays(easter, -2),
    holySat: addDays(easter, -1),
    divineMercy: addDays(easter, 7),
    ascension: cfg.ascensionSunday ? addDays(easter, 42) : addDays(easter, 39),
    pentecost: addDays(easter, 49),
    maryMotherChurch: addDays(easter, 50),
    trinity: addDays(easter, 56),
    corpusChristi: cfg.corpusSunday ? addDays(easter, 63) : addDays(easter, 60),
    sacredHeart: addDays(easter, 68),
    immaculateHeart: addDays(easter, 69),
    christmas: makeDate(y, 12, 25),
    advent1: addDays(sundayOnOrBefore(makeDate(y, 12, 24)), -21),
  };
  A.christKing = addDays(A.advent1, -7);
  A.holyFamily = dow(A.christmas) === 0 ? makeDate(y, 12, 30) : sundayAfter(A.christmas);

  if (cfg.epiphanySunday) {
    // Sunday between January 2 and 8; Baptism the following Sunday, or the
    // Monday after Epiphany when Epiphany falls on January 7 or 8.
    A.epiphany = sundayOnOrBefore(makeDate(y, 1, 8));
    A.baptism = A.epiphany.getUTCDate() >= 7 ? addDays(A.epiphany, 1) : addDays(A.epiphany, 7);
    A.christmas2 = null;
  } else {
    A.epiphany = makeDate(y, 1, 6);
    A.baptism = sundayAfter(A.epiphany);
    const s = sundayOnOrBefore(makeDate(y, 1, 5));
    A.christmas2 = s.getUTCFullYear() === y && s.getUTCDate() >= 2 ? s : null;
  }
  anchorCache.set(ck, A);
  return A;
}

function psalterFromWeek(week) { return ((week - 1) % 4 + 4) % 4 + 1; }

/**
 * Describe the temporal (Proper of Time) day for a date.
 * Returns { season, week, key, sundayKey, title, rank, prec, color, psalterWeek, isSunday, ... }
 */
export function temporalDay(d, cfg) {
  const y = d.getUTCFullYear();
  const A = anchors(y, cfg);
  const wd = dow(d);
  const D = DOW_KEYS[wd];
  const Dn = DOW_NAMES[wd];
  const md = d.getUTCDate();
  const isSunday = wd === 0;
  const base = { dow: D, isSunday, litYear: d >= A.advent1 ? y + 1 : y };
  let t;

  if (d >= A.advent1) {
    const prevSun = sundayOnOrBefore(d);
    const cyclePsalter = (Math.floor(daysBetween(A.advent1, prevSun) / 7) % 4) + 1;
    if (d < A.christmas) {
      const week = Math.floor(daysBetween(A.advent1, d) / 7) + 1;
      const sundayKey = `time/advent/w${week}/sun`;
      if (isSunday) {
        t = { season: 'advent', week, key: sundayKey, title: `${ordinal(week)} Sunday of Advent`,
          rank: 'sunday', prec: 2, color: week === 3 ? 'rose' : 'violet' };
      } else if (md >= 17) {
        t = { season: 'advent', week, key: `time/advent/dec${md}`, sundayKey,
          title: `${Dn}, December ${md}`, rank: 'weekday', prec: 9, color: 'violet' };
      } else {
        t = { season: 'advent', week, key: `time/advent/w${week}/${D}`, sundayKey,
          title: `${Dn} of the ${ordinal(week)} Week of Advent`, rank: 'weekday', prec: 13, color: 'violet' };
      }
      t.psalterWeek = psalterFromWeek(week);
    } else {
      if (md === 25) {
        t = { key: 'time/christmas/dec25', title: 'The Nativity of the Lord (Christmas)',
          rank: 'solemnity', prec: 2, color: 'white', octave: true };
      } else if (sameDay(d, A.holyFamily)) {
        t = { key: 'time/christmas/holy-family', title: 'The Holy Family of Jesus, Mary and Joseph',
          rank: 'feast', prec: 5, color: 'white', octave: true, lordFeast: true };
      } else {
        t = { key: `time/christmas/dec${md}`,
          title: `${ordinal(md - 24)} Day within the Octave of the Nativity of the Lord`,
          rank: 'weekday', prec: 9, color: 'white', octave: true };
      }
      t.season = 'christmas';
      t.week = 0;
      t.psalterWeek = cyclePsalter;
    }
  } else if (d <= A.baptism) {
    // Christmas season, January portion.
    const prevAdvent = anchors(y - 1, cfg).advent1;
    const psalterWeek = (Math.floor(daysBetween(prevAdvent, sundayOnOrBefore(d)) / 7) % 4) + 1;
    if (md === 1) {
      t = { key: 'time/christmas/jan01', title: 'Mary, the Holy Mother of God',
        rank: 'solemnity', prec: 3, color: 'white', octave: true };
    } else if (sameDay(d, A.epiphany)) {
      t = { key: 'time/christmas/epiphany', title: 'The Epiphany of the Lord',
        rank: 'solemnity', prec: 2, color: 'white' };
    } else if (sameDay(d, A.baptism)) {
      t = { key: 'time/christmas/baptism', title: 'The Baptism of the Lord',
        rank: 'feast', prec: 5, color: 'white', lordFeast: true };
    } else if (sameDay(d, A.christmas2)) {
      t = { key: 'time/christmas/sun2', title: 'Second Sunday after the Nativity',
        rank: 'sunday', prec: 6, color: 'white' };
    } else if (d < A.epiphany || !cfg.epiphanySunday) {
      t = { key: `time/christmas/jan${pad2(md)}`, title: `${Dn}, January ${md}`,
        rank: 'weekday', prec: 13, color: 'white' };
    } else {
      t = { key: `time/christmas/after-epiphany/${D}`, title: `${Dn} after Epiphany`,
        rank: 'weekday', prec: 13, color: 'white' };
    }
    t.season = 'christmas';
    t.week = 0;
    t.psalterWeek = psalterWeek;
  } else if (d < A.ashWed) {
    const week = Math.floor(daysBetween(sundayOnOrBefore(A.baptism), d) / 7) + 1;
    t = ordinaryDay(week, D, Dn, isSunday);
  } else if (d < A.palmSun) {
    if (sameDay(d, A.ashWed)) {
      t = { week: 0, key: 'time/lent/ash-wed', title: 'Ash Wednesday', rank: 'weekday', prec: 2, color: 'violet', psalterWeek: 4 };
    } else if (d < A.lent1) {
      t = { week: 0, key: `time/lent/w0/${D}`, title: `${Dn} after Ash Wednesday`,
        rank: 'weekday', prec: 9, color: 'violet', psalterWeek: 4 };
    } else {
      const week = Math.floor(daysBetween(A.lent1, d) / 7) + 1;
      const sundayKey = `time/lent/w${week}/sun`;
      t = isSunday
        ? { week, key: sundayKey, title: `${ordinal(week)} Sunday of Lent`, rank: 'sunday', prec: 2, color: week === 4 ? 'rose' : 'violet' }
        : { week, key: `time/lent/w${week}/${D}`, sundayKey, title: `${Dn} of the ${ordinal(week)} Week of Lent`, rank: 'weekday', prec: 9, color: 'violet' };
      t.psalterWeek = psalterFromWeek(week);
    }
    t.season = 'lent';
  } else if (d < A.easter) {
    const holy = {
      sun: { title: 'Palm Sunday of the Passion of the Lord', prec: 2, color: 'red', rank: 'sunday' },
      mon: { title: 'Monday of Holy Week', prec: 2, color: 'violet', rank: 'weekday' },
      tue: { title: 'Tuesday of Holy Week', prec: 2, color: 'violet', rank: 'weekday' },
      wed: { title: 'Wednesday of Holy Week', prec: 2, color: 'violet', rank: 'weekday' },
      thu: { title: 'Thursday of Holy Week (Holy Thursday)', prec: 2, color: 'violet', rank: 'weekday' },
      fri: { title: 'Friday of the Passion of the Lord (Good Friday)', prec: 1, color: 'red', rank: 'triduum' },
      sat: { title: 'Holy Saturday', prec: 1, color: 'violet', rank: 'triduum' },
    }[D];
    const triduum = D === 'fri' || D === 'sat';
    t = { ...holy, week: 6, season: triduum ? 'triduum' : 'lent',
      key: triduum ? `time/triduum/${D}` : `time/holyweek/${D}`, sundayKey: 'time/holyweek/sun', psalterWeek: 2 };
  } else if (d <= A.pentecost) {
    const week = Math.floor(daysBetween(A.easter, d) / 7) + 1;
    const sundayKey = `time/easter/w${week}/sun`;
    if (sameDay(d, A.easter)) {
      t = { key: sundayKey, title: 'Easter Sunday of the Resurrection of the Lord', rank: 'solemnity', prec: 1, color: 'white', octave: true };
    } else if (week === 1) {
      t = { key: `time/easter/w1/${D}`, title: `${Dn} within the Octave of Easter`, rank: 'solemnity', prec: 2, color: 'white', octave: true };
    } else if (sameDay(d, A.ascension)) {
      t = { key: 'time/easter/ascension', sundayKey, title: 'The Ascension of the Lord', rank: 'solemnity', prec: 2, color: 'white' };
    } else if (sameDay(d, A.pentecost)) {
      t = { key: 'time/easter/pentecost', title: 'Pentecost Sunday', rank: 'solemnity', prec: 2, color: 'red' };
    } else if (isSunday) {
      t = { key: sundayKey, title: week === 2 ? 'Second Sunday of Easter (Sunday of Divine Mercy)' : `${ordinal(week)} Sunday of Easter`, rank: 'sunday', prec: 2, color: 'white' };
    } else {
      t = { key: `time/easter/w${week}/${D}`, sundayKey, title: `${Dn} of the ${ordinal(week)} Week of Easter`, rank: 'weekday', prec: 13, color: 'white' };
    }
    t.week = week;
    t.season = 'easter';
    t.psalterWeek = psalterFromWeek(week);
  } else {
    const week = 34 - daysBetween(sundayOnOrBefore(d), A.christKing) / 7;
    t = ordinaryDay(week, D, Dn, isSunday);
    const special = [
      [A.trinity, 'time/ordinary/trinity', 'The Most Holy Trinity'],
      [A.corpusChristi, 'time/ordinary/corpus-christi', 'The Most Holy Body and Blood of Christ (Corpus Christi)'],
      [A.sacredHeart, 'time/ordinary/sacred-heart', 'The Most Sacred Heart of Jesus'],
      [A.christKing, 'time/ordinary/christ-king', 'Our Lord Jesus Christ, King of the Universe'],
    ].find(([dt]) => sameDay(d, dt));
    if (special) {
      Object.assign(t, { key: special[1], title: special[2], rank: 'solemnity', prec: 3, color: 'white' });
    }
  }
  return { ...base, ...t };
}

function ordinaryDay(week, D, Dn, isSunday) {
  const sundayKey = `time/ordinary/w${week}/sun`;
  return isSunday
    ? { season: 'ordinary', week, key: sundayKey, title: `${ordinal(week)} Sunday in Ordinary Time`, rank: 'sunday', prec: 6, color: 'green', psalterWeek: psalterFromWeek(week) }
    : { season: 'ordinary', week, key: `time/ordinary/w${week}/${D}`, sundayKey, title: `${Dn} of the ${ordinal(week)} Week in Ordinary Time`, rank: 'weekday', prec: 13, color: 'green', psalterWeek: psalterFromWeek(week) };
}

/** Sunday cycle (A/B/C) and weekday cycle (I/II) for a liturgical year. */
export function cycles(litYear) {
  return { sundayCycle: ['C', 'A', 'B'][litYear % 3], weekdayCycle: litYear % 2 ? 'I' : 'II' };
}
