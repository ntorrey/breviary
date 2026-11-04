// Date helpers. All liturgical dates are handled as UTC midnight Date objects
// so that daylight-saving changes never shift a day.

export const DAY_MS = 86400000;
export const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function makeDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
export function addDays(dt, n) { return new Date(dt.getTime() + n * DAY_MS); }
export function toIso(dt) { return dt.toISOString().slice(0, 10); }
export function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return makeDate(y, m, d);
}
/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / DAY_MS); }
export function dow(dt) { return dt.getUTCDay(); }
export function sameDay(a, b) { return !!a && !!b && a.getTime() === b.getTime(); }
export function sundayOnOrBefore(dt) { return addDays(dt, -dt.getUTCDay()); }
/** First Sunday strictly after dt. */
export function sundayAfter(dt) { return addDays(dt, 7 - dt.getUTCDay()); }
export function pad2(n) { return String(n).padStart(2, '0'); }
export function mmdd(dt) { return `${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`; }

/** The local calendar date on this device, as YYYY-MM-DD. */
export function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm). */
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(y, month, day);
}

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth',
  'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth',
  'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty-first', 'Twenty-second',
  'Twenty-third', 'Twenty-fourth', 'Twenty-fifth', 'Twenty-sixth', 'Twenty-seventh',
  'Twenty-eighth', 'Twenty-ninth', 'Thirtieth', 'Thirty-first', 'Thirty-second', 'Thirty-third',
  'Thirty-fourth'];
export function ordinal(n) { return ORDINALS[n] || `${n}th`; }

export function longDate(iso) {
  const d = fromIso(iso);
  return `${DOW_NAMES[dow(d)]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
