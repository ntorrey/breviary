// Content store: the breviary text lives in JSON "shards" under /content.
// content/index.json maps key prefixes to shard files, e.g.
//   { "version": "abc123", "shards": { "psalter/w1": "psalter-w1.json", "ordinary": "ordinary.json" } }
// Each shard is { "entries": { "<entry key>": { "<field>": value, ... } } }.
// Shards are loaded on demand and cached by the service worker for offline use.

export class ContentStore {
  /** @param {(path: string) => Promise<any>} loadJson  loads a JSON file relative to /content */
  constructor(loadJson) {
    this.loadJson = loadJson;
    this.index = { version: 'empty', shards: {} };
    this.entries = new Map();
    this.loaded = new Map(); // shard file -> Promise
  }

  async init() {
    try {
      this.index = await this.loadJson('index.json');
    } catch {
      this.index = { version: 'empty', shards: {} };
    }
    return this;
  }

  shardFor(key) {
    const parts = key.split('/');
    for (let n = parts.length; n > 0; n--) {
      const prefix = parts.slice(0, n).join('/');
      if (this.index.shards[prefix]) return this.index.shards[prefix];
    }
    return null;
  }

  /** Make sure all shards needed for these entry keys are loaded. */
  async ensure(keys) {
    const files = new Set();
    for (const k of keys) {
      const f = this.shardFor(k);
      if (f) files.add(f);
    }
    await Promise.all([...files].map((f) => this.loadShard(f)));
  }

  loadShard(file) {
    if (!this.loaded.has(file)) {
      const p = this.loadJson(`${file}?v=${encodeURIComponent(this.index.version)}`)
        .then((data) => {
          for (const [k, v] of Object.entries(data.entries || {})) this.entries.set(k, v);
        })
        .catch((err) => {
          this.loaded.delete(file);
          console.warn('Could not load content shard', file, err);
        });
      this.loaded.set(file, p);
    }
    return this.loaded.get(file);
  }

  async loadAll() {
    await Promise.all(Object.values(this.index.shards).map((f) => this.loadShard(f)));
  }

  get(key) { return this.entries.get(key); }

  stats() {
    return { version: this.index.version, shards: Object.keys(this.index.shards).length, entriesLoaded: this.entries.size };
  }
}
