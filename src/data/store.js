// Persistence + serialized dispatch. UI talks only to this; business rules live in core/engine.js.

import { apply, createInitialState } from '../core/engine.js';
import { migrate, reconcile } from '../core/migrations.js';
import { GameError } from '../core/util.js';

const DB_NAME = 'life-rpg';
const DB_VERSION = 1; // IndexedDB structure version; app data schema is versioned separately in core/migrations.js

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export function indexedDbAdapter(idb = globalThis.indexedDB, name = DB_NAME) {
  let dbPromise;
  const open = () => (dbPromise ??= new Promise((resolve, reject) => {
    const r = idb.open(name, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const db = r.result;
      if (e.oldVersion < 1) { db.createObjectStore('state'); db.createObjectStore('secrets'); }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Database is open in another tab with an older version'));
  }));
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then((v) => { result = v; });
      t.oncomplete = () => resolve(result); // resolve only once the write is durable
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  };
  return {
    load: () => tx('state', 'readonly', (st) => req(st.get('main'))),
    save: (s) => tx('state', 'readwrite', (st) => { st.put(s, 'main'); }),
    getSecret: (k) => tx('secrets', 'readonly', (st) => req(st.get(k))),
    setSecret: (k, v) => tx('secrets', 'readwrite', (st) => { if (v) st.put(v, k); else st.delete(k); }),
    clear: async () => {
      await tx('state', 'readwrite', (st) => { st.clear(); });
      await tx('secrets', 'readwrite', (st) => { st.clear(); });
    },
  };
}

export function memoryAdapter(initial = null) {
  let data = initial ? structuredClone(initial) : null;
  const secrets = new Map();
  return {
    failNextSave: false,
    async load() { return data ? structuredClone(data) : null; },
    async save(s) {
      if (this.failNextSave) { this.failNextSave = false; throw new Error('Simulated disk failure'); }
      data = structuredClone(s);
    },
    async getSecret(k) { return secrets.get(k); },
    async setSecret(k, v) { if (v) secrets.set(k, v); else secrets.delete(k); },
    async clear() { data = null; secrets.clear(); },
    peek: () => data,
  };
}

export function createStore(adapter, { clock = () => Date.now() } = {}) {
  let state = null;
  let queue = Promise.resolve();
  const listeners = new Set();
  const emit = (events) => listeners.forEach((fn) => fn(state, events));

  // Operations run strictly one at a time, so a double-tap can never complete a quest twice.
  const enqueue = (job) => {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  };

  const store = {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    init: () => enqueue(async () => {
      const raw = await adapter.load();
      let fixes = [];
      if (!raw) {
        state = createInitialState(clock());
      } else {
        state = migrate(raw);
        fixes = reconcile(state);
      }
      const rolled = apply(state, 'rollover', null, clock());
      await adapter.save(rolled.state);
      state = rolled.state;
      emit(rolled.events);
      return { fixes, events: rolled.events };
    }),

    dispatch: (action, payload) => enqueue(async () => {
      if (!state) throw new GameError('Store not initialised');
      const { state: next, events } = apply(state, action, payload, clock());
      await adapter.save(next); // commit in memory only after the durable write succeeds
      state = next;
      emit(events);
      return events;
    }),

    exportData() {
      return JSON.stringify({ app: 'life-rpg', exportedAt: new Date(clock()).toISOString(), data: state }, null, 2);
    },

    importData: (json) => enqueue(async () => {
      let parsed;
      try { parsed = JSON.parse(json); } catch { throw new GameError('File is not valid JSON'); }
      if (parsed?.app !== 'life-rpg') throw new GameError('This is not a LIFE RPG export');
      const next = migrate(parsed.data);
      const fixes = reconcile(next);
      await adapter.save(next);
      state = next;
      emit([{ type: 'info', message: 'Data imported.' }]);
      return fixes;
    }),

    wipe: () => enqueue(async () => {
      await adapter.clear();
      const fresh = createInitialState(clock());
      await adapter.save(fresh);
      state = fresh;
      emit([{ type: 'info', message: 'All data deleted.' }]);
    }),

    getSecret: (k) => adapter.getSecret(k),
    setSecret: (k, v) => adapter.setSecret(k, v),
  };
  return store;
}
