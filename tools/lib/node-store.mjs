// A ContentStore that reads the built content/ folder from disk (for Node tools and tests).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentStore } from '../../js/content/store.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function nodeStore() {
  const store = new ContentStore(async (p) => JSON.parse(await readFile(join(ROOT, 'content', p.split('?')[0]), 'utf8')));
  await store.init();
  await store.loadAll();
  return store;
}
