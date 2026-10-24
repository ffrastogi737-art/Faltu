// Local persistence: one IndexedDB record written in a single transaction per change.
// The in-memory state only changes after the write has completed, so a failure never leaves half-saved data.

export const SCHEMA_VERSION = 2;

export function initialState(now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    scenarios: [],
    comparisons: [],
    trees: [],
    runs: [],
    templates: [],
    models: [],
    settings: { currency: 'INR', locale: 'en-IN', ai: { modelId: null, nCtx: 2048, autoLoad: false }, reduceMotion: false },
  };
}

// Never edit a shipped migration; append a new one.
export const MIGRATIONS = {
  // v1 -> v2: decision trees, run history and custom templates were added.
  1: (s) => { s.trees ??= []; s.runs ??= []; s.templates ??= []; s.models ??= []; s.settings = { ...initialState(0).settings, ...s.settings }; return s; },
};

export function migrate(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.scenarios)) throw new Error('Saved data is not a WHAT IF? database');
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) throw new Error('Saved data has no schema version');
  if (input.schemaVersion > SCHEMA_VERSION) throw new Error('Saved data comes from a newer app version');
  const s = structuredClone(input);
  while (s.schemaVersion < SCHEMA_VERSION) {
    MIGRATIONS[s.schemaVersion](s);
    s.schemaVersion++;
  }
  return s;
}

const req = (r) => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });

export function indexedDbAdapter(idb = globalThis.indexedDB, name = 'whatif') {
  let db;
  const open = () => (db ??= new Promise((ok, fail) => {
    const r = idb.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((ok, fail) => {
      const t = d.transaction('kv', mode);
      let out;
      Promise.resolve(fn(t.objectStore('kv'))).then((v) => { out = v; });
      t.oncomplete = () => ok(out);
      t.onerror = () => fail(t.error);
      t.onabort = () => fail(t.error || new Error('Transaction aborted'));
    });
  };
  return {
    load: () => tx('readonly', (st) => req(st.get('state'))),
    save: (s) => tx('readwrite', (st) => { st.put(s, 'state'); }),
    clear: () => tx('readwrite', (st) => { st.clear(); }),
  };
}

export function memoryAdapter(initial = null) {
  let data = initial ? structuredClone(initial) : null;
  return {
    failNext: false,
    async load() { return data ? structuredClone(data) : null; },
    async save(s) { if (this.failNext) { this.failNext = false; throw new Error('Simulated storage failure'); } data = structuredClone(s); },
    async clear() { data = null; },
    peek: () => data,
  };
}

export function createStore(adapter, { clock = () => Date.now() } = {}) {
  let state = null;
  let queue = Promise.resolve();
  const listeners = new Set();
  const enqueue = (job) => { const run = queue.then(job); queue = run.catch(() => {}); return run; };
  return {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    init: () => enqueue(async () => {
      const raw = await adapter.load();
      state = raw ? migrate(raw) : initialState(clock());
      if (!raw || raw.schemaVersion !== state.schemaVersion) await adapter.save(state);
      return state;
    }),
    /** fn mutates a draft copy; throwing inside fn or failing to save leaves state untouched. */
    update: (fn) => enqueue(async () => {
      const draft = structuredClone(state);
      const out = await fn(draft, clock());
      await adapter.save(draft);
      state = draft;
      listeners.forEach((l) => l(state));
      return out;
    }),
    exportJSON() {
      return JSON.stringify({ app: 'whatif', exportedAt: new Date(clock()).toISOString(), data: { ...state, models: [] } }, null, 2);
    },
    importJSON: (text) => enqueue(async () => {
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('File is not valid JSON'); }
      if (parsed?.app !== 'whatif') throw new Error('This is not a WHAT IF? export');
      const next = migrate(parsed.data);
      next.models = state.models; // model files are device-specific and never travel in exports
      await adapter.save(next);
      state = next;
      listeners.forEach((l) => l(state));
    }),
    wipe: () => enqueue(async () => {
      await adapter.clear();
      state = initialState(clock());
      await adapter.save(state);
      listeners.forEach((l) => l(state));
    }),
  };
}
