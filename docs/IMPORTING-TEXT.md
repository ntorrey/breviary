# Getting the new translation into the app

The app is ready for the text: every Hour of every day already knows *which* text belongs where. What remains is getting the words of the new edition into `content-src/` in the source format (see [CONTENT-FORMAT.md](CONTENT-FORMAT.md)). This guide covers how to do that, from best to worst option.

## Step 0 — Permission comes first

The English Liturgy of the Hours is not one copyright but several:

| Material | Typical rights holder |
|---|---|
| Translation of prayers, antiphons, responsories, intercessions, rubrics | ICEL (International Commission on English in the Liturgy) |
| Psalms and canticles (Abbey Psalms and Canticles in the new U.S. edition) | USCCB (check the copyright page of the new edition) |
| Scripture readings | Holder of whichever Bible translation the edition uses |
| Hymns | Many separate owners (publishers, composers' estates) |
| Patristic and hagiographical readings | ICEL or the publisher, depending on the edition |
| The edition as a whole (layout, arrangement) | The publisher(s) |

Apps like iBreviary, Universalis and Divine Office hold licenses for this. Before you distribute the app with the new text, even free and even only to your parish:

1. Contact the **USCCB Permissions office** and **ICEL**. Describe the app and its audience, and ask what license covers a free or paid app. Get it in writing.
2. Ask separately about **hymns**. They are often excluded from the main license. A common workaround is to use public-domain hymns, or to show only the first line.
3. If the license limits who may see the text (for example, members of a religious community), deploy the app behind a login. Everything in `content/` is a plain file, and anyone who can reach the site can download it. Cloudflare Access, Netlify password protection, or a private GitHub Pages site can restrict this.

Keeping the text on your own phone for private prayer is a gray area. Distributing it is not.

## Option A (best) — Get a structured digital file from the licensor

Publishers typeset these books from XML or similar structured files. When you negotiate the license, **ask for the digital source**: XML, the ePub, or the typesetting export. Also ask what format they supply to other app makers. With a structured file, the import is a one-time conversion script rather than months of typing:

- Write a converter (Node or Python) that walks the publisher's structure and emits `content-src/*.txt` entries.
- Map their identifiers (for example "Week II, Tuesday, Morning Prayer, Antiphon 1") to our keys (`psalter/w2/tue/mp` → `ant1`).
- Rubrics are usually marked by a style or tag, so they map straight to our `!` rubric lines.

I can write this converter once you have a sample file.

## Option B — The ePub edition

If an ebook edition comes out, it is the next best thing. An ePub is a zip of XHTML pages. Red rubrics, antiphons and psalm lines are distinguished by CSS classes, so a script can convert them reliably:

1. Unzip the `.epub` and look at a few pages to learn the class names (`rubric`, `antiphon`, `psalm-line`, and so on).
2. Write a converter that maps each section heading to our keys and each class to our markup.
3. Expect to hand-fix cross-references such as "Psalmody from Sunday, Week I".

Check that the license permits extraction. ePubs usually come with DRM, and removing it may breach the terms.

## Option C — PDF

Text extraction from PDF loses structure but keeps two useful clues: **color** (rubrics are red) and **position** (indentation marks the second half-lines of psalm verses). Tools like PyMuPDF or pdfplumber can output each word with its color and x-position. A script can then rebuild the structure. It works, but expect much more proofreading than with an ePub.

## Option D — Print only

Scan the book and run OCR, or type it in. This is the slowest path and has the highest error rate. If you go this way:

- Use the skeleton files (`npm run skeleton`) as the typing template, so nothing gets missed.
- Have the text **double-keyed**: two people type the same section and a script diffs the results. That's how liturgical publishers catch errors.

## Using AI to speed up structuring (any option)

Claude can turn a chunk of extracted text into the source format: splitting fields, adding `V/`/`R/` and `*` marks, assigning keys. The danger is silent paraphrase. To control it:

- Instruct it to copy wording exactly and only add structure.
- Run an automatic check that the **sequence of words** in the output matches the input exactly, ignoring markup. Anything that differs gets flagged for a human. (Ask me to add this checker to `tools/` when you're ready.)

## The workflow, end to end

```
npm run skeleton          # 1. fill-in-the-blank files in content-src/_skeleton/
                          # 2. copy a file out of _skeleton/, fill it (by hand or by converter)
npm run build:content     # 3. compile to content/*.json and list warnings
npm run coverage -- 2027  # 4. see what is still missing, ranked by impact
npm start                 # 5. proofread in the app with Settings → "Show text sources"
```

Suggested order of work. Each step makes many days complete at once:

1. **Ordinary**: Gospel canticles, invitatory psalms, Glory Be, Our Father, dismissals.
2. **Psalms and canticles**: about 150 psalms plus divisions and canticles, each entered once and referenced everywhere.
3. **Four-week psalter**: with 1 and 2 done, most Ordinary Time weekdays become complete.
4. **Night Prayer**: seven entries.
5. **Proper of Time**: Advent, Christmas, Lent, Easter, then the Ordinary Time Sundays and Office of Readings.
6. **Commons**: these complete every memorial that lacks proper texts.
7. **Proper of Saints**: mostly concluding prayers and Office of Readings second readings.
8. Hymns, as licensing allows.

## Proofreading and corrections

- Keep `content-src/` in **git**. Every correction is then a reviewable change, and you can see who fixed what and when.
- In the app, turn on **Show text sources** in Settings. Each text then shows the exact key it came from, so a reader who spots a typo can report the key, and you can find the right line at once.
- Errata from the publisher become small commits. Re-run `npm run build:content` and deploy. The service worker picks up the new content version automatically.

## Things to check when the new edition arrives

- **Structure differences.** If the new edition adds or renames parts (for example a two-year cycle of readings), use variant fields such as `reading1@I` / `reading1@II`. The app already understands `@A/@B/@C` (Sunday cycle), `@I/@II` (weekday cycle) and `@advent/@lent/@easter/...` (season).
- **Titles of celebrations.** These live in `js/calendar/sanctoral-data.js` and `js/calendar/temporal.js`. Update them to match the new book's wording.
- **Names of the Hours.** For example "Daytime Prayer" vs. "Midmorning/Midday/Midafternoon". These are in `HOURS` in `js/office/assemble.js`.
- **Rubrics.** Compare the new edition's general instruction with the rules in `js/office/assemble.js` (`chainFor`) and adjust where the new book differs.
