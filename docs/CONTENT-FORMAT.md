# Content format and key scheme

## Translations (editions)

Each translation is a folder in `content-src/` containing an `edition.json`:

```
content-src/
  current/       edition.json + .txt files  - current U.S. translation (empty until licensed)
  new/           edition.json + .txt files  - the new translation (empty until released)
  english-pd/    edition.json + .txt files  - English, public domain (Douay-Rheims)
  latin/         edition.json + .txt files  - Latin, public domain (Clementine Vulgate)
  _skeleton/     fill-in-the-blank templates (not built)
```

`edition.json` fields:

| Field | Meaning |
|---|---|
| `name` | Shown in Settings → Translation |
| `description` | Shown under the selector |
| `order` | Position in the list |
| `default` | `true` on the edition used when the reader hasn't chosen one. If it has no text yet, the first edition with text is used. |
| `fallback` | Optional id of another edition that fills in anything this one lacks. Useful while an edition is only partly entered, but it mixes translations within one Hour, so use it with care. |

`npm run build:content` builds each edition into `content/<id>/` and lists them all in `content/editions.json`. Editions with no text appear in Settings as "not yet loaded" and can't be selected. The keys and fields below are the same for every edition, so switching translation changes only the words, never the structure.

## Source files (`content-src/<edition>/**/*.txt`)

```
%% A comment line (ignored)
=== psalter/w1/sun/mp            <- an ENTRY: one Hour of one source
--- hymn                         <- a FIELD of that entry
First line of the hymn,
second line.

Second stanza.
--- ps1
psalms/63                        <- a reference to a psalm entry
--- reading
@ref Revelation 7:10, 12         <- @properties at the top of a field
Text of the reading.
```

- Build with `npm run build:content`. Folders beginning with `_` (such as `_skeleton`) are skipped.
- Empty fields are ignored, so half-filled files are fine.
- If the same entry and field appear twice, the later file wins and a warning is printed.

## Text markup inside fields

| Write | Shows as |
|---|---|
| blank line | new stanza or paragraph |
| line starting with two spaces | indented line (second half of a psalm verse) |
| `V/ text` | ℣. text |
| `R/ text` | ℟. text |
| `! text` | red italic rubric |
| ` * ` and ` † ` | red mediant and flex marks |
| `_text_` | italics |

## Entry keys

| Key | Meaning |
|---|---|
| `ordinary` | Fixed texts: `intro`, `intro_inv`, `gloria`, `our_father`, `dismissal`, `conclusion`, `examen`, `blessing`, `te_deum`, `marian@advent/lent/easter/ordinary` |
| `psalms/<n>`, `psalms/<n>-i` | A psalm (or a division of one): `title`, `subtitle`, `text`, optional `no_gloria` |
| `canticles/<id>` | Canticles: `benedictus`, `magnificat`, `nunc-dimittis`, `invitatory-95` (also `100`, `67`, `24`), and the Old and New Testament canticles |
| `psalter/w<1-4>/<day>/<hour>` | Four-Week Psalter. Days: `sun`…`sat`. Hours: below |
| `psalter/w<n>/<day>/daytime` | Psalmody shared by the three daytime Hours |
| `psalter/complementary/<terce/sext/none>` | Complementary psalmody (solemnities) |
| `night/<day>` | Night Prayer. `sat` = after Evening Prayer I, `sun` = after Evening Prayer II |
| `time/advent/w<n>/<day>`, `time/advent/dec17`…`dec24` | Advent |
| `time/christmas/dec25`…`dec31`, `holy-family`, `jan01`…, `epiphany`, `after-epiphany/<day>`, `baptism`, `sun2` | Christmas Time |
| `time/lent/ash-wed`, `time/lent/w0/<day>`, `time/lent/w<n>/<day>` | Lent (`w0` = the days after Ash Wednesday) |
| `time/holyweek/<day>`, `time/triduum/fri`, `time/triduum/sat` | Holy Week and Triduum |
| `time/easter/w<n>/<day>`, `ascension`, `pentecost` | Easter Time (`w1` = Octave; `w1/sun` = Easter Sunday) |
| `time/ordinary/w<n>/<day>`, `trinity`, `corpus-christi`, `sacred-heart`, `christ-king` | Ordinary Time |
| `saints/<id>/<hour>` | Proper of Saints. The id comes from `js/calendar/sanctoral-data.js` |
| `commons/<id>/<hour>` | Commons: `bvm`, `bvm-saturday`, `apostles`, `martyr`, `martyrs`, `pastors`, `doctors`, `virgins`, `holy-men`, `holy-women`, `religious`, `mercy`, `educators`, `dedication` |

**Hour slots:** `inv`, `or`, `mp`, `terce`, `sext`, `none`, `daytime`, `ep`, `ep1` (Evening Prayer I), `ep2` (Evening Prayer II of Sundays and solemnities; falls back to `ep`).

## Fields

| Hour | Fields |
|---|---|
| Invitatory | `invitatory_ant` |
| Office of Readings | `hymn`, `ant1` `ps1` `ant2` `ps2` `ant3` `ps3`, `verse`, `reading1`, `resp1`, `reading2`, `resp2`, `prayer` |
| Morning Prayer | `hymn`, psalmody, `reading`, `responsory`, `benedictus_ant`, `intercessions`, `prayer` |
| Daytime Prayer | `hymn`, psalmody, `reading`, `verse`, `prayer` |
| Evening Prayer | `hymn`, psalmody, `reading`, `responsory`, `magnificat_ant`, `intercessions`, `prayer` |
| Night Prayer | `hymn`, `ant1` `ps1` (`ant2` `ps2`), `reading`, `responsory`, `nunc_ant`, `prayer` |

Readings take properties: `@ref` (citation), `@author` and `@title` (for patristic readings).
A `psN` field holds a reference such as `psalms/63` or `canticles/dan3-57-88`. It can also hold an inline psalm, using `@title` and the text.

## Variants

Any field can have variants. The app tries them in this order and uses the first one present:

1. `field@A` / `field@B` / `field@C` (Sunday cycle)
2. `field@I` / `field@II` (weekday cycle)
3. `field@advent` / `@christmas` / `@lent` / `@triduum` / `@easter` / `@ordinary` (season)
4. `field`

In Easter Time, psalter antiphons with no `@easter` form automatically get "alleluia" added.

## How the app chooses where each text comes from

See `chainFor()` in `js/office/assemble.js`. In summary (GILH 226–240):

- **Weekdays and Sundays**: Proper of Time for the day, then (for the concluding prayer) that week's Sunday, then the psalter.
- **Solemnities and feasts**: Proper of Saints, then the Commons. Morning Prayer psalms come from Sunday Week I. Daytime psalmody is complementary on solemnities and the current psalter on feasts.
- **Memorials**: Hymn, readings at Morning and Evening Prayer, Gospel canticle antiphons, intercessions, prayer and the second reading of the Office of Readings come from the proper, then the common, then the weekday. Psalmody comes from the weekday unless the saint has proper psalmody. The daytime Hours come entirely from the weekday.
- **Commemorations** (memorials on privileged weekdays): the weekday Office, plus an optional hagiographical reading and prayer at the Office of Readings, and the saint's antiphon and prayer at Morning and Evening Prayer.
