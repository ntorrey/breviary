# Breviary: Liturgy of the Hours (PWA)

A phone-friendly Liturgy of the Hours app, built as a **progressive web app**: it works in any browser, installs to the home screen like a native app, and works offline. It is built ahead of the new English translation. The calendar and the assembly of each Hour are complete, and the text is loaded separately once it is available and licensed.

## What works now

- **Full liturgical calendar**, computed on the device: seasons, Sundays, weeks, Psalter weeks, Sunday and weekday cycles. It covers the General Roman Calendar plus the **USA proper calendar**, with:
  - precedence (Table of Liturgical Days)
  - transfers of solemnities, including the special rules for St. Joseph and the Annunciation
  - feasts of the Lord replacing Ordinary Time Sundays
  - memorials becoming commemorations in Lent and late Advent
  - optional memorials you can choose, and the Saturday memorial of Mary
  - Evening Prayer I of Sundays and solemnities
  - Ascension on Thursday or Sunday
  - **local celebrations** (diocesan patron, church dedication, order saints) added in Settings
- **All Hours**: Invitatory, Office of Readings, Morning Prayer, Midmorning, Midday, Midafternoon, Evening Prayer (I and II), Night Prayer. Each Hour is assembled from the right sources (proper, common, season, psalter) following the GILH.
- **Light and dark mode** (follows the phone, or set manually), adjustable text size, and an option to keep the screen on.
- **Offline**: the service worker caches the app and every text it has loaded. "Download all" in Settings saves everything.
- **Placeholders that explain themselves.** Where text isn't loaded yet, the app shows exactly which entries it looked in. That doubles as the import to-do list.

## Run it on your computer

Requires [Node.js](https://nodejs.org) 20 or later. There is nothing to install.

```bash
npm start
```

Open http://localhost:8080. To see the phone layout, use your browser's device toolbar.

```bash
npm test
```

Runs the calendar and office-assembly tests.

## Put it on your phone

A PWA has to be served over **HTTPS**. Free options that serve this folder as-is (no build step):

- **GitHub Pages**: push the folder to a repository, then Settings → Pages → deploy from branch.
- **Netlify** or **Cloudflare Pages**: drag and drop the folder, or connect the repository.

Then on the phone:

- **iPhone**: open the site in Safari → Share → **Add to Home Screen**.
- **Android**: open it in Chrome → menu → **Install app**.

> Once real text is loaded, check the license before putting it on a public URL (see [docs/IMPORTING-TEXT.md](docs/IMPORTING-TEXT.md#step-0--permission-comes-first)).

### Android app (APK)

There is also an installable Android app: [download Breviary.apk](https://github.com/ntorrey/breviary/releases/download/android/Breviary.apk). It wraps the live site, so web updates reach it automatically. Both of its system bars match the app's background, and its full-screen reading mode hides them entirely. See [android-app/README.md](android-app/README.md) for how it's built and signed.

## Adding the text

- [docs/IMPORTING-TEXT.md](docs/IMPORTING-TEXT.md): licensing, and strategies for getting the new translation in, from best (structured file from the publisher) to worst (typing).
- [docs/CONTENT-FORMAT.md](docs/CONTENT-FORMAT.md): the source format, key scheme, fields, and how each Hour is put together.

```bash
npm run skeleton
```

Writes fill-in-the-blank files for every text to `content-src/_skeleton/`.

```bash
npm run build:content
```

Compiles `content-src/` into `content/`.

```bash
npm run coverage -- 2027
```

Reports what is still missing, ranked by impact.

### Translations

The app can hold several translations side by side and switch between them in **Settings → Translation**. Each one is a folder in `content-src/`:

- `current/`: the current U.S. *Liturgy of the Hours*. It's marked as the default, so it's used automatically once it has text. Empty for now, because the text is copyrighted and has to be loaded under license.
- `new/`: the new translation, once it's released and licensed. To make it the default, move `"default": true` from `current/edition.json` to `new/edition.json`.
- `placeholder/`: what the app shows today. It has public-domain prayers (traditional English, Latin Marian antiphons), plus one fully filled-in sample Hour: Morning Prayer of the First Sunday of Advent 2026.

The structure is the same for every translation, so switching changes the words and nothing else. See [docs/CONTENT-FORMAT.md](docs/CONTENT-FORMAT.md#translations-editions).

### Android system bar colour

The manifest's `theme_color` is fixed at black (`#000000`) by choice. Chrome on Android paints the bottom navigation bar of an installed app with that colour and fixes it at install time, so it can't follow the app's in-app theme. Black was chosen over following the phone's setting. The top status bar is coloured at runtime from the page's `<meta name="theme-color">`, which `js/settings.js` keeps in step with the chosen theme. If you change the manifest, an already-installed app picks the change up only after Chrome rebuilds it: open `chrome://webapks` → **Update**, or reinstall.

### Full-screen reading

The button at the top right of any Hour hides everything but the text. Tap the text to show the exit button, or press Esc. It doesn't use the browser's own full-screen mode, because on Android that always shows a "drag from the top to exit" message. Opened from the home-screen icon, the app has no browser bars, so only the text shows. Settings → **Open Hours full screen** makes this the default.

## Project layout

```
index.html, manifest.webmanifest, sw.js   PWA shell, install manifest, offline service worker
css/app.css                               styles; light/dark theme tokens at the top
js/app.js                                 screens: Today, Hour, Calendar, Settings
js/settings.js                            user settings (stored on the device)
js/calendar/                              liturgical calendar engine and saints data
js/office/assemble.js                     which text goes where in each Hour (GILH rules)
js/office/render.js                       text markup → HTML
js/content/store.js                       loads text shards on demand
content-src/<translation>/                editable text sources, one folder per translation
content/<translation>/, editions.json     compiled JSON (generated; what the app loads)
tools/                                    dev server, content build, skeleton, coverage, icons
tests/                                    node --test suites
```

## Known simplifications and to-dos

These are places where the rules are more detailed than the app currently models. All are noted so they can be refined against the new edition's General Instruction:

- **Triduum specifics.** For example, Evening Prayer on Holy Thursday is only for those not at the evening Mass, and Good Friday and Holy Saturday have their own peculiarities. These are handled by the content, not by special logic.
- **All Souls** is treated as a solemnity-rank day with its own office. The special rule for when it falls on a Sunday isn't modeled.
- **Two solemnities on one day** (for example, the Sacred Heart on June 24): the saint's solemnity moves to the next free day. In 2022 the Holy See instead anticipated the Nativity of John the Baptist to June 23. Such years can be handled with a local override.
- The Invitatory doesn't yet switch away from Psalm 24 when that psalm occurs in the day's psalmody.
- Office of Readings **vigils**, and combining an Hour with Mass, aren't implemented.
- **Thanksgiving Day and Independence Day** (U.S. Missal observances) aren't in the calendar.
- The **day changes at local midnight**. Evening Prayer I shows on the evening before.
