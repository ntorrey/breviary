// A ContentStore that reads the built content/ folder from disk (for Node tools and tests).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentStore } from '../../js/content/store.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Pick an edition the same way the app does: the requested one, else the default with text, else any with text. */
export async function resolveEdition(requested) {
  const { editions } = JSON.parse(await readFile(join(ROOT, 'content', 'editions.json'), 'utf8'));
  const ready = editions.filter((e) => e.entries > 0);
  if (requested) {
    const e = editions.find((x) => x.id === requested);
    if (!e) throw new Error(`No edition "${requested}". Available: ${editions.map((x) => x.id).join(', ')}`);
    return e;
  }
  return ready.find((e) => e.default) || ready[0] || editions[0];
}

export async function nodeStore(editionId) {
  const ed = await resolveEdition(editionId);
  const store = new ContentStore(async (p) => JSON.parse(await readFile(join(ROOT, 'content', ed.id, p.split('?')[0]), 'utf8')));
  store.edition = ed;
  await store.init();
  await store.loadAll();
  return store;
}
