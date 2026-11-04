// User settings, stored in this browser only (localStorage).
const KEY = 'breviary.settings';

export const DEFAULTS = {
  theme: 'system',          // system | light | dark | black
  textSize: 19,             // px
  font: 'classic',          // classic | literata | garamond | sourceserif | atkinson | sans
  region: 'usa',            // usa | general
  ascensionSunday: null,    // null = regional default
  invitatoryPsalm: '95',    // 95 | 100 | 67 | 24
  showSources: true,        // show where each text came from / what is missing
  keepAwake: false,         // keep the screen on while reading an Hour
  focusOnOpen: false,       // open every Hour in full-screen reading mode
  edition: null,            // text edition (translation) id; null = the default one
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
  if (['light', 'dark', 'black'].includes(s.theme)) root.dataset.theme = s.theme;
  else delete root.dataset.theme;
  root.style.setProperty('--text-size', `${s.textSize}px`);
  if (s.font && s.font !== 'classic') root.dataset.font = s.font;
  else delete root.dataset.font;
  // Match the phone's status bar to the page background.
  const meta = document.getElementById('themeColor');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f7f3ea';
  // Inside the Android app, colour the area behind the phone's status bar to match.
  try { window.BreviaryAndroid?.setStatusBarColor(meta?.content || ''); } catch { /* not in the Android app */ }
}

/** True when running inside the Android app (APK) rather than a browser. */
export const inAndroidApp = typeof navigator !== 'undefined' && /BreviaryAndroidApp/.test(navigator.userAgent);

// Follow the phone switching between light and dark while in Auto mode.
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
