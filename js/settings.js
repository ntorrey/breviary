// User settings, stored in this browser only (localStorage).
const KEY = 'breviary.settings';

export const DEFAULTS = {
  theme: 'system',          // system | light | dark
  textSize: 19,             // px
  region: 'usa',            // usa | general
  ascensionSunday: null,    // null = regional default
  invitatoryPsalm: '95',    // 95 | 100 | 67 | 24
  showSources: true,        // show where each text came from / what is missing
  keepAwake: false,         // keep the screen on while reading an Hour
  choices: {},              // { 'YYYY-MM-DD': celebrationId } for optional memorials
  localCelebrations: [],    // [{ date: 'MM-DD', title, rank, color, commons }]
};

let current = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings() { return current; }

export function updateSettings(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode: keep in memory */ }
  for (const fn of listeners) fn(current);
  return current;
}

export function onSettingsChange(fn) { listeners.add(fn); }

/** Settings as the calendar engine expects them. */
export function calendarSettings(s = current) {
  const out = { region: s.region, choices: s.choices, localCelebrations: s.localCelebrations };
  if (s.ascensionSunday !== null && s.ascensionSunday !== undefined) out.ascensionSunday = s.ascensionSunday;
  return out;
}

export function applyTheme(s = current) {
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') root.dataset.theme = s.theme;
  else delete root.dataset.theme;
  root.style.setProperty('--text-size', `${s.textSize}px`);
}
