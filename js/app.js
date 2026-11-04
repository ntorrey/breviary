// App shell: routing and views.
import { getDay, getEvening, getMonth, RANK_LABELS } from './calendar/index.js';
import { REGIONS } from './calendar/sanctoral-data.js';
import { todayIso, longDate, fromIso, toIso, addDays, MONTH_NAMES, DOW_NAMES, pad2 } from './calendar/dates.js';
import { HOURS, HOUR_NAMES, assembleHour } from './office/assemble.js';
import { blocksToHtml, escapeHtml as esc } from './office/render.js';
import { ContentStore } from './content/store.js';
import { getSettings, updateSettings, calendarSettings, applyTheme, onSettingsChange, inAndroidApp } from './settings.js';

const APK_URL = 'https://github.com/ntorrey/breviary/releases/download/android/Breviary.apk';

const main = document.getElementById('main');
const topbar = document.getElementById('topbar');

// ---------------- Translations (text editions) ----------------
// content/editions.json lists the editions; each lives in content/<id>/.
let editions = [];
let store = null;
let storeReady = null;
const editionsReady = fetch('content/editions.json')
  .then((r) => (r.ok ? r.json() : { editions: [] }))
  .catch(() => ({ editions: [] }))
  .then((d) => { editions = d.editions || []; });

/** The edition in use: the one chosen in Settings if it has text, else the first that does. */
function activeEdition() {
  const ready = editions.filter((e) => e.entries > 0);
  const want = getSettings().edition;
  return ready.find((e) => e.id === want) || ready.find((e) => e.default) || ready[0] || editions[0] || { id: 'interim', name: 'Placeholder texts' };
}

function openStore() {
  storeReady = editionsReady.then(() => {
    const ed = activeEdition();
    store = new ContentStore(async (p) => {
      const r = await fetch(`content/${ed.id}/${p}`);
      if (!r.ok) throw new Error(`${r.status} ${p}`);
      return r.json();
    });
    return store.init();
  });
  return storeReady;
}
openStore();

const ICON = {
  expand: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  collapse: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};

const FONTS = [
  ['classic', 'Classic (Palatino)'],
  ['literata', 'Literata'],
  ['garamond', 'EB Garamond'],
  ['sourceserif', 'Source Serif'],
  ['atkinson', 'Atkinson Hyperlegible'],
  ['sans', 'System sans-serif'],
];

const SEASON_NAMES = { advent: 'Advent', christmas: 'Christmas Time', ordinary: 'Ordinary Time', lent: 'Lent', triduum: 'Paschal Triduum', easter: 'Easter Time' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const shiftIso = (iso, n) => toIso(addDays(fromIso(iso), n));

// ---------------- Router ----------------
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const isoOk = (s) => /^\d{4}-\d\d-\d\d$/.test(s || '');
  switch (parts[0]) {
    case 'day': return { view: 'day', iso: isoOk(parts[1]) ? parts[1] : todayIso() };
    case 'hour': return { view: 'hour', iso: isoOk(parts[1]) ? parts[1] : todayIso(), hour: HOUR_NAMES[parts[2]] ? parts[2] : 'mp' };
    case 'calendar': return { view: 'calendar', ym: /^\d{4}-\d\d$/.test(parts[1] || '') ? parts[1] : todayIso().slice(0, 7) };
    case 'settings': return { view: 'settings' };
    default: return { view: 'day', iso: todayIso(), isToday: true };
  }
}

let renderToken = 0;
async function render() {
  const route = parseRoute();
  const token = ++renderToken;
  document.body.classList.toggle('reading', route.view === 'hour');
  document.body.classList.remove('bar-hidden');
  lastScrollY = 0;
  for (const a of document.querySelectorAll('.tabbar a')) {
    const tab = a.dataset.tab;
    const on = (tab === 'today' && route.view === 'day') || tab === route.view;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  releaseWakeLock();
  if (route.view !== 'hour' && focusMode) setFocus(false);
  try {
    if (route.view === 'day') renderDay(route.iso);
    else if (route.view === 'hour') await renderHour(route.iso, route.hour, token);
    else if (route.view === 'calendar') renderCalendar(route.ym);
    else renderSettings();
  } catch (err) {
    console.error(err);
    main.innerHTML = `<p class="loading">Something went wrong: ${esc(err.message)}</p>`;
  }
  if (route.view !== 'hour') window.scrollTo(0, 0);
}

function setTopbar({ left = '', title = '', sub = '', right = '' }) {
  topbar.innerHTML = `${left || '<span class="icon-btn" hidden></span>'}
    <div class="title"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    ${right || '<span class="icon-btn" hidden></span>'}`;
}

// ---------------- Day view ----------------
function renderDay(iso) {
  const s = getSettings();
  const cs = calendarSettings(s);
  const day = getDay(iso, cs);
  const cel = day.celebration;
  const t = day.temporal;
  const isToday = iso === todayIso();

  setTopbar({
    left: `<a class="icon-btn" href="#/day/${shiftIso(iso, -1)}" aria-label="Previous day">${ICON.left}</a>`,
    title: isToday ? 'Today' : longDate(iso).replace(/, \d{4}$/, ''),
    sub: isToday ? longDate(iso) : String(fromIso(iso).getUTCFullYear()),
    right: `<a class="icon-btn" href="#/day/${shiftIso(iso, 1)}" aria-label="Next day">${ICON.right}</a>`,
  });

  const rankLabel = RANK_LABELS[cel.rank] || '';
  const weekLine = cel.source === 'temporal' ? SEASON_NAMES[day.season] : t.title;
  const notes = [];
  if (cel.transferredFrom) notes.push(`Ordinarily ${fmtShort(cel.transferredFrom)}; ${cel.transferNote}.`);
  if (day.suppressed.length) notes.push(`Not celebrated this year: ${day.suppressed.map((x) => x.title).join('; ')}.`);
  if (day.commemoration) notes.push(`With a commemoration of ${day.commemoration.title}.`);

  const options = day.options.length > 1 ? `
    <div class="choice">
      <label for="celebrate">Celebrate</label>
      <select id="celebrate">
        ${day.options.map((o) => `<option value="${esc(o.id)}" ${o.id === day.selectedId ? 'selected' : ''}>${esc(o.source === 'temporal' ? `Weekday: ${o.title}` : `${o.title} (${RANK_LABELS[o.rank]})`)}</option>`).join('')}
      </select>
    </div>` : '';

  const evening = getEvening(iso, cs);
  const hourSub = {
    ep: evening.kind === 'ep1' ? `Evening Prayer I of ${evening.day.celebration.title}` : '',
    np: evening.kind === 'ep1' ? 'After Evening Prayer I' : '',
  };

  main.innerHTML = `
    <section class="day-head lit-${cel.color}">
      <p class="meta">${esc(weekLine)} · Psalter Week ${ROMAN[day.psalterWeek]}</p>
      <h1>${esc(cel.title)}</h1>
      <div class="chips">
        <span class="chip lit-${cel.color}"><span class="dot"></span>${esc(capital(cel.color))}</span>
        ${rankLabel ? `<span class="chip">${esc(rankLabel)}</span>` : ''}
        <span class="chip">Year ${day.sundayCycle} · Weekdays ${day.weekdayCycle}</span>
      </div>
      ${notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
      ${options}
    </section>
    <h2 class="section-title">The Hours</h2>
    <ul class="hours">
      ${HOURS.map((h) => `
        <li><a href="#/hour/${iso}/${h.id}">
          <span class="hname">${esc(h.id === 'ep' && evening.kind === 'ep1' ? 'Evening Prayer I' : h.name)}
            ${hourSub[h.id] ? `<span class="hsub">${esc(hourSub[h.id])}</span>` : ''}</span>
          <span class="chev">${ICON.right}</span>
        </a></li>`).join('')}
    </ul>
    ${isToday ? '' : `<p class="fine" style="text-align:center;margin-top:20px"><a href="#/">Go to today</a></p>`}`;

  const sel = document.getElementById('celebrate');
  if (sel) sel.addEventListener('change', () => {
    updateSettings({ choices: { ...getSettings().choices, [iso]: sel.value } });
    renderDay(iso);
  });
}

function fmtShort(iso) {
  const d = fromIso(iso);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** 'MM-DD' -> 'March 17' */
const monthDay = (md) => {
  const [m, d] = String(md).split('-').map(Number);
  return MONTH_NAMES[m - 1] ? `${MONTH_NAMES[m - 1]} ${d}` : md;
};
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------- Hour view ----------------
async function renderHour(iso, hour, token) {
  const s = getSettings();
  setTopbar({
    left: `<a class="icon-btn" href="#/day/${iso}" aria-label="Back to the day">${ICON.back}</a>`,
    title: HOUR_NAMES[hour],
    sub: longDate(iso),
  });
  main.innerHTML = '<p class="loading">Preparing the Office…</p>';
  await storeReady;
  const office = await assembleHour(iso, hour, { ...calendarSettings(s), showSources: s.showSources, invitatoryPsalm: s.invitatoryPsalm }, store);
  if (token !== renderToken) return;

  setTopbar({
    left: `<a class="icon-btn" href="#/day/${iso}" aria-label="Back to the day">${ICON.back}</a>`,
    title: office.title,
    sub: longDate(iso),
    right: `<button class="icon-btn" id="focusBtn" type="button" aria-label="Full-screen reading" title="Full-screen reading">${ICON.expand}</button>`,
  });
  document.getElementById('focusBtn').addEventListener('click', () => setFocus(true));
  const missing = office.blocks.filter((b) => b.k === 'missing').length;
  main.innerHTML = `
    <article class="office lit-${office.ctx.cel.color}">
      <header class="office-head">
        <h1>${esc(office.title)}</h1>
        <p>${esc(office.subtitle)}</p>
      </header>
      ${missing && s.showSources ? `<p class="rubric block missing-note" style="font-family:var(--sans);font-size:13px;text-align:center">${missing === 1 ? '1 part of this Hour is' : `${missing} parts of this Hour are`} not yet loaded in this translation. Tap one to see where the app looked.</p>` : ''}
      ${blocksToHtml(s.showSources ? office.blocks : office.blocks.filter((b) => b.k !== 'missing'))}
    </article>`;
  window.scrollTo(0, 0);
  if (s.keepAwake) requestWakeLock();
  if (s.focusOnOpen && !focusMode) setFocus(true);
}

// ---------------- Full-screen reading mode ----------------
// Hides the app's bars and every editing aid so only the text remains.
// It deliberately does NOT call the browser's Fullscreen API: on Android that
// always shows a "drag from the top to exit full screen" message, which pages
// cannot suppress. Opened from the home-screen icon, the app has no browser
// bars anyway, so reading mode already shows only the text.
let focusMode = false;
const focusExit = document.createElement('button');
focusExit.type = 'button';
focusExit.className = 'focus-exit';
focusExit.innerHTML = ICON.collapse;
focusExit.setAttribute('aria-label', 'Exit full screen');
focusExit.title = 'Exit full screen';
focusExit.addEventListener('click', (e) => { e.stopPropagation(); setFocus(false); });
document.body.appendChild(focusExit);
let exitTimer;

function showFocusExit() {
  focusExit.classList.add('visible');
  clearTimeout(exitTimer);
  exitTimer = setTimeout(() => focusExit.classList.remove('visible'), 2500);
}

function setFocus(on) {
  focusMode = on;
  document.body.classList.toggle('focus', on);
  if (on) showFocusExit();
  else focusExit.classList.remove('visible');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focusMode) setFocus(false); });

// While praying an Hour, the top bar slides away when scrolling down and
// returns when scrolling up (or at the top of the page).
let lastScrollY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (!document.body.classList.contains('reading')) return;
  if (y < 40 || y < lastScrollY - 6) document.body.classList.remove('bar-hidden');
  else if (y > lastScrollY + 6) document.body.classList.add('bar-hidden');
  if (Math.abs(y - lastScrollY) > 6) lastScrollY = y;
}, { passive: true });
// In reading mode, a tap on the text briefly shows the exit button.
main.addEventListener('click', (e) => {
  if (focusMode && !e.target.closest('a, button, summary, select, input')) {
    if (focusExit.classList.contains('visible')) focusExit.classList.remove('visible');
    else showFocusExit();
  }
});

let wakeLock = null;
async function requestWakeLock() {
  try { window.BreviaryAndroid?.keepScreenOn(true); } catch { /* not in the Android app */ }
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported or denied */ }
}
function releaseWakeLock() {
  try { window.BreviaryAndroid?.keepScreenOn(false); } catch { /* not in the Android app */ }
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && parseRoute().view === 'hour' && getSettings().keepAwake) requestWakeLock();
});

// ---------------- Calendar view ----------------
function renderCalendar(ym) {
  const [y, m] = ym.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  setTopbar({
    left: `<a class="icon-btn" href="#/calendar/${prev}" aria-label="Previous month">${ICON.left}</a>`,
    title: `${MONTH_NAMES[m - 1]} ${y}`,
    sub: REGIONS[getSettings().region]?.name,
    right: `<a class="icon-btn" href="#/calendar/${next}" aria-label="Next month">${ICON.right}</a>`,
  });
  const today = todayIso();
  const days = getMonth(y, m, calendarSettings());
  main.innerHTML = `
    <ul class="cal-list" style="margin-top:8px">
      ${days.map((d) => {
        const c = d.celebration;
        const dt = fromIso(d.iso);
        const opt = d.options.length > 1 && c.source === 'temporal' ? d.options.slice(1).map((o) => o.title).join('; ') : '';
        return `<li class="${d.iso === today ? 'today' : ''} ${d.temporal.isSunday ? 'sunday' : ''}">
          <a href="#/day/${d.iso}">
            <span class="cal-num"><b>${dt.getUTCDate()}</b><small>${DOW_NAMES[dt.getUTCDay()].slice(0, 3)}</small></span>
            <span>
              <span class="cal-title lit-${c.color}"><span class="dot"></span><span>${esc(c.title)}</span></span>
              <span class="cal-rank">${esc([RANK_LABELS[c.rank], opt && `Optional: ${opt}`].filter(Boolean).join(' · '))}</span>
            </span>
          </a></li>`;
      }).join('')}
    </ul>`;
  document.querySelector('.cal-list li.today')?.scrollIntoView({ block: 'center' });
}

// ---------------- Settings view ----------------
function renderSettings() {
  const s = getSettings();
  setTopbar({ title: 'Settings' });
  const region = REGIONS[s.region] || REGIONS.usa;
  const ascSunday = s.ascensionSunday ?? region.options.ascensionSunday;
  const seg = (name, value, opts) => `<div class="seg" role="group">${opts.map(([v, l]) =>
    `<button type="button" data-set="${name}" data-value="${v}" aria-pressed="${String(value) === v}">${l}</button>`).join('')}</div>`;

  main.innerHTML = `
    <div class="settings">
      <h1>Settings</h1>
      <h2 class="section-title">Appearance</h2>
      <div class="card">
        <div class="row"><span class="lbl">Theme</span>${seg('theme', s.theme, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['black', 'Black']])}</div>
        <div class="row"><label for="font">Font</label>
          <select id="font">${FONTS.map(([v, l]) => `<option value="${v}" ${v === s.font ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="row"><label for="textSize">Text size<small id="textSizeVal">${s.textSize}px</small></label>
          <input id="textSize" type="range" min="14" max="34" step="1" value="${s.textSize}"></div>
        <p class="font-preview"><span class="mark">Ant.</span> O God, come to my assistance. O Lord, make haste to help me.</p>
        <div class="row"><label for="keepAwake">Keep screen on while praying<small>Where the browser supports it</small></label>
          <input id="keepAwake" type="checkbox" ${s.keepAwake ? 'checked' : ''}></div>
        <div class="row"><label for="focusOnOpen">Open Hours full screen<small>Show only the text. Tap the text to find the exit button. You can also use the full-screen button at the top of any Hour.</small></label>
          <input id="focusOnOpen" type="checkbox" ${s.focusOnOpen ? 'checked' : ''}></div>
      </div>

      <h2 class="section-title">Calendar</h2>
      <div class="card">
        <div class="row"><label for="region">Calendar</label>
          <select id="region">${Object.entries(REGIONS).map(([k, r]) => `<option value="${k}" ${k === s.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="row"><label for="ascension">Ascension<small>Most U.S. provinces transfer it to Sunday</small></label>
          <select id="ascension"><option value="sun" ${ascSunday ? 'selected' : ''}>Sunday</option><option value="thu" ${!ascSunday ? 'selected' : ''}>Thursday</option></select></div>
        <div class="row"><label for="invPsalm">Invitatory psalm</label>
          <select id="invPsalm">${['95', '100', '67', '24'].map((p) => `<option ${p === s.invitatoryPsalm ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      </div>

      <h2 class="section-title">Local celebrations</h2>
      <div class="card">
        <ul class="local-list">${s.localCelebrations.length ? s.localCelebrations.map((l, i) =>
          `<li><span>${esc(monthDay(l.date))} · ${esc(l.title)} <small>(${esc({ S: 'Solemnity', F: 'Feast', M: 'Memorial', OM: 'Optional Memorial' }[l.rank])})</small></span>
           <button class="btn" data-del="${i}">Remove</button></li>`).join('') : '<li><span style="color:var(--muted)">Add your diocesan patron, the anniversary of your church’s dedication, your religious order’s saints, and so on.</span></li>'}</ul>
        <form class="local-form" id="localForm">
          <input name="title" placeholder="Title (e.g. Saint Patrick, Principal Patron of the Diocese)" required>
          <label class="field-label" for="localDate">Date <small>(only the month and day are kept; it repeats every year)</small></label>
          <div class="two">
            <input id="localDate" name="date" type="date" value="${todayIso()}" required>
            <select name="rank"><option value="S">Solemnity</option><option value="F">Feast</option><option value="M" selected>Memorial</option><option value="OM">Optional Memorial</option></select>
          </div>
          <div class="two">
            <select name="color"><option value="white">White</option><option value="red">Red</option><option value="violet">Violet</option><option value="green">Green</option></select>
            <select name="commons"><option value="">Common…</option><option>pastors</option><option>martyr</option><option>martyrs</option><option>virgins</option><option>holy-men</option><option>holy-women</option><option>religious</option><option>doctors</option><option>bvm</option><option>apostles</option><option>dedication</option></select>
          </div>
          <button class="btn primary" type="submit">Add celebration</button>
        </form>
      </div>

      <h2 class="section-title">Text</h2>
      <div class="card">
        <div class="row"><label for="edition">Translation<small id="editionInfo"></small></label>
          <select id="edition"></select></div>
        <div class="row"><label for="showSources">Show text sources<small>Shows where each text came from and what is still missing. Useful while importing.</small></label>
          <input id="showSources" type="checkbox" ${s.showSources ? 'checked' : ''}></div>
        <div class="row"><span class="lbl">Downloaded text<small id="contentInfo">Checking…</small></span>
          <button class="btn" id="downloadAll">Download all</button></div>
        <div class="row"><span class="lbl">Optional memorial choices<small>${Object.keys(s.choices).length} saved</small></span>
          <button class="btn" id="clearChoices">Clear</button></div>
      </div>
      <h2 class="section-title">About</h2>
      <div class="card">
        <div class="row"><span class="lbl">App version<small id="appBuilt"></small></span><strong id="appVersion">…</strong></div>
        ${inAndroidApp ? '' : `<div class="row"><span class="lbl">Android app<small>Download the APK and open it on an Android phone to install.</small></span>
          <a class="btn" href="${APK_URL}" rel="noopener">Download</a></div>`}
      </div>
      <p class="fine">Settings are stored on this device only. The liturgical calendar is computed on the device and works offline.</p>
    </div>`;

  main.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    updateSettings({ [b.dataset.set]: b.dataset.value });
    renderSettings();
  }));
  const ts = document.getElementById('textSize');
  ts.addEventListener('input', () => {
    updateSettings({ textSize: Number(ts.value) });
    document.getElementById('textSizeVal').textContent = `${ts.value}px`;
  });
  const bind = (id, fn, ev = 'change') => document.getElementById(id).addEventListener(ev, fn);
  bind('font', (e) => updateSettings({ font: e.target.value }));
  bind('keepAwake', (e) => updateSettings({ keepAwake: e.target.checked }));
  bind('focusOnOpen', (e) => updateSettings({ focusOnOpen: e.target.checked }));
  bind('edition', async (e) => {
    updateSettings({ edition: e.target.value });
    await openStore();
    toast(`Now using: ${activeEdition().name}`);
    renderSettings();
  });
  fillEditionSelect();
  bind('showSources', (e) => updateSettings({ showSources: e.target.checked }));
  bind('region', (e) => { updateSettings({ region: e.target.value, ascensionSunday: null }); renderSettings(); });
  bind('ascension', (e) => updateSettings({ ascensionSunday: e.target.value === 'sun' }));
  bind('invPsalm', (e) => updateSettings({ invitatoryPsalm: e.target.value }));
  bind('clearChoices', () => { updateSettings({ choices: {} }); toast('Choices cleared'); renderSettings(); }, 'click');
  bind('downloadAll', async () => {
    await storeReady;
    toast('Downloading…');
    await store.loadAll();
    toast('All available text is saved for offline use');
    showContentInfo();
  }, 'click');
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const list = [...getSettings().localCelebrations];
    list.splice(Number(b.dataset.del), 1);
    updateSettings({ localCelebrations: list });
    renderSettings();
  }));
  bind('localForm', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const entry = Object.fromEntries(f.entries());
    // The date picker gives YYYY-MM-DD; a local celebration recurs, so keep MM-DD.
    if (!/^\d{4}-\d\d-\d\d$/.test(entry.date)) return toast('Please choose a date');
    entry.date = entry.date.slice(5);
    updateSettings({ localCelebrations: [...getSettings().localCelebrations, entry] });
    toast('Added');
    renderSettings();
  }, 'submit');
  showContentInfo();
  showVersion();
}

// version.json is written by the deploy workflow; it is absent when running locally.
async function showVersion() {
  let v = null;
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    if (r.ok) v = await r.json();
  } catch { /* offline with nothing cached */ }
  const vEl = document.getElementById('appVersion');
  const bEl = document.getElementById('appBuilt');
  if (!vEl) return;
  if (!v) {
    vEl.textContent = 'Development';
    bEl.textContent = 'Not a deployed build';
    return;
  }
  vEl.textContent = v.version;
  const built = new Date(v.built);
  bEl.textContent = `Updated ${built.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}, ${built.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${v.commit}`;
}

async function fillEditionSelect() {
  await editionsReady;
  const sel = document.getElementById('edition');
  if (!sel) return;
  const active = activeEdition();
  sel.innerHTML = editions.map((e) => `<option value="${esc(e.id)}" ${e.id === active.id ? 'selected' : ''} ${e.entries ? '' : 'disabled'}>${esc(e.name)}${e.entries ? '' : ' (not yet loaded)'}</option>`).join('')
    || '<option>None installed</option>';
  const info = document.getElementById('editionInfo');
  if (info) info.textContent = active.description || '';
}

async function showContentInfo() {
  await storeReady;
  const el = document.getElementById('contentInfo');
  if (!el) return;
  const st = store.stats();
  el.textContent = st.shards
    ? `${activeEdition().name}, version ${st.version} · ${st.shards} file${st.shards > 1 ? 's' : ''} · ${st.entriesLoaded} entries loaded`
    : 'No text installed yet';
}

// ---------------- Misc ----------------
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

onSettingsChange((s) => applyTheme(s));
applyTheme();
window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // When a new version has been deployed, the new service worker takes over and
  // the page reloads to show it, unless someone is in the middle of an Hour;
  // then the reload waits until they leave it.
  const hadController = !!navigator.serviceWorker.controller;
  let updatePending = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing to update
    if (parseRoute().view === 'hour') {
      updatePending = true;
      toast('An update is ready. It will apply when you leave this Hour.');
    } else location.reload();
  });
  window.addEventListener('hashchange', () => {
    if (updatePending && parseRoute().view !== 'hour') location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // Check for updates whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service worker not registered', e));
}
