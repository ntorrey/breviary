// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDay, getEvening } from '../js/calendar/index.js';
import { easterSunday, toIso } from '../js/calendar/dates.js';

const US = { region: 'usa' };
const GEN = { region: 'general' };
const title = (iso, s = US) => getDay(iso, s).celebration.title;
const id = (iso, s = US) => getDay(iso, s).celebration.id;

test('Easter dates', () => {
  assert.equal(toIso(easterSunday(2025)), '2025-04-20');
  assert.equal(toIso(easterSunday(2026)), '2026-04-05');
  assert.equal(toIso(easterSunday(2027)), '2027-03-28');
  assert.equal(toIso(easterSunday(2035)), '2035-03-25');
});

test('seasons and Sundays', () => {
  assert.equal(title('2026-02-18'), 'Ash Wednesday');
  assert.equal(title('2026-11-29'), 'First Sunday of Advent');
  assert.equal(title('2026-11-22'), 'Our Lord Jesus Christ, King of the Universe');
  assert.equal(title('2026-05-24'), 'Pentecost Sunday');
  assert.equal(getDay('2026-06-01').temporal.title, 'Monday of the Ninth Week in Ordinary Time');
  assert.equal(getDay('2026-11-03').temporal.week, 31);
  assert.equal(getDay('2026-11-03').psalterWeek, 3);
  assert.equal(title('2026-12-13'), 'Third Sunday of Advent');
  assert.equal(getDay('2026-12-13').celebration.color, 'rose');
});

test('liturgical year cycles', () => {
  assert.equal(getDay('2026-03-01').sundayCycle, 'A');
  assert.equal(getDay('2026-03-01').weekdayCycle, 'II');
  assert.equal(getDay('2026-11-29').sundayCycle, 'B');
  assert.equal(getDay('2026-11-29').weekdayCycle, 'I');
});

test('Christmas season (USA)', () => {
  assert.equal(title('2026-01-04'), 'The Epiphany of the Lord');
  assert.equal(title('2026-01-11'), 'The Baptism of the Lord');
  assert.equal(title('2024-01-08'), 'The Baptism of the Lord'); // Epiphany on Jan 7 -> Monday
  assert.equal(title('2022-12-30'), 'The Holy Family of Jesus, Mary and Joseph'); // Christmas on Sunday
  assert.equal(title('2023-01-01'), 'Mary, the Holy Mother of God');
  assert.equal(getDay('2026-01-05').psalterWeek, 2);
  assert.equal(getDay('2025-12-28').psalterWeek, 1);
});

test('Christmas season (General Roman Calendar)', () => {
  assert.equal(title('2026-01-06', GEN), 'The Epiphany of the Lord');
  assert.equal(title('2026-01-04', GEN), 'Second Sunday after the Nativity');
});

test('transfers of solemnities', () => {
  assert.equal(id('2024-12-09'), 'immaculate-conception'); // Dec 8 on Advent Sunday
  assert.equal(id('2024-12-08'), 'time/advent/w2/sun');
  assert.equal(id('2024-04-08'), 'annunciation'); // Mar 25 in Holy Week
  assert.equal(id('2027-04-05'), 'annunciation'); // Mar 25 is Holy Thursday
  assert.equal(id('2035-03-17'), 'joseph'); // Mar 19 in Holy Week -> Saturday before Palm Sunday
  assert.equal(id('2026-03-19'), 'joseph');
});

test('feasts of the Lord replace Ordinary Time Sundays; saints do not', () => {
  assert.equal(id('2025-11-09'), 'lateran');
  assert.equal(id('2026-09-13'), 'time/ordinary/w24/sun'); // John Chrysostom memorial on Sunday suppressed
});

test('memorials, optional memorials and commemorations', () => {
  const nov3 = getDay('2026-11-03');
  assert.equal(nov3.celebration.source, 'temporal'); // default is the weekday
  assert.ok(nov3.options.some((o) => o.id === 'martin-de-porres'));
  const chosen = getDay('2026-11-03', { ...US, choices: { '2026-11-03': 'martin-de-porres' } });
  assert.equal(chosen.celebration.id, 'martin-de-porres');

  assert.equal(id('2026-11-04'), 'charles-borromeo');
  assert.equal(getDay('2026-11-04').celebration.rank, 'memorial');

  // Lent weekday: memorial becomes a commemoration
  const mar7 = getDay('2025-03-07');
  assert.equal(mar7.celebration.source, 'temporal');
  assert.ok(mar7.options.some((o) => o.id === 'perpetua-felicity' && o.rank === 'commemoration'));

  // Christmas octave: feasts outrank the octave weekdays
  assert.equal(id('2026-12-26'), 'stephen');
  assert.equal(getDay('2026-12-29').options[1]?.id, 'thomas-becket');

  // Mary, Mother of the Church prevails over another obligatory memorial (2028: St. Boniface)
  assert.equal(id('2028-06-05'), 'mary-mother-church');

  // USA proper calendar
  assert.equal(id('2026-07-14'), 'kateri-tekakwitha');
  assert.equal(getDay('2026-12-12').celebration.rank, 'feast');
  assert.equal(getDay('2026-12-12', GEN).celebration.source, 'temporal');
});

test('Evening Prayer I', () => {
  const sat = getEvening('2026-11-28');
  assert.equal(sat.kind, 'ep1');
  assert.equal(sat.day.celebration.title, 'First Sunday of Advent');
  assert.equal(getEvening('2026-11-30').kind, 'ep');
  assert.equal(getEvening('2026-12-24').kind, 'ep1'); // Christmas
  assert.equal(getEvening('2026-04-04').kind, 'ep'); // Holy Saturday: no EP I of Easter
  assert.equal(getEvening('2026-04-11').kind, 'ep1'); // Saturday in the Octave -> Divine Mercy Sunday
  assert.equal(getEvening('2026-10-31').kind, 'ep1'); // All Saints
});

test('every day of several years resolves without error', () => {
  for (const s of [US, GEN]) {
    for (let y = 2024; y <= 2040; y++) {
      for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d = new Date(d.getTime() + 86400000)) {
        const day = getDay(toIso(d), s);
        assert.ok(day.celebration.title, toIso(d));
        assert.ok(day.psalterWeek >= 1 && day.psalterWeek <= 4, toIso(d));
      }
    }
  }
});
