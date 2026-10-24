import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryAdapter, migrate, SCHEMA_VERSION } from '../src/data/store.js';
import { newScenario, runScenario } from '../src/engine/scenario.js';

const T = 1_700_000_000_000;
const make = (adapter = memoryAdapter()) => { const s = createStore(adapter, { clock: () => T }); return s.init().then(() => s); };

test('scenarios survive a restart', async () => {
  const adapter = memoryAdapter();
  const a = await make(adapter);
  await a.update((s, now) => { s.scenarios.push(newScenario('business', { id: 'b1', name: 'Shop', now, withExamples: true })); });
  const b = await make(adapter);
  assert.equal(b.state.scenarios[0].name, 'Shop');
  assert.equal(runScenario(b.state.scenarios[0]).summary.totalRevenue, runScenario(a.state.scenarios[0]).summary.totalRevenue);
});

test('a failed write leaves memory and storage unchanged', async () => {
  const adapter = memoryAdapter();
  const st = await make(adapter);
  adapter.failNext = true;
  await assert.rejects(st.update((s) => { s.scenarios.push({ id: 'x' }); }), /storage failure/);
  assert.equal(st.state.scenarios.length, 0);
  assert.equal(adapter.peek().scenarios.length, 0);
});

test('an error inside an update rolls back', async () => {
  const st = await make();
  await assert.rejects(st.update((s) => { s.scenarios.push({ id: 'x' }); throw new Error('validation'); }), /validation/);
  assert.equal(st.state.scenarios.length, 0);
});

test('updates are serialized', async () => {
  const st = await make();
  await Promise.all(Array.from({ length: 20 }, (_, i) => st.update((s) => { s.runs.push(i); })));
  assert.deepEqual(st.state.runs, Array.from({ length: 20 }, (_, i) => i));
});

test('v1 data migrates forward; newer or foreign data is refused', () => {
  const v1 = { schemaVersion: 1, scenarios: [{ id: 'a' }], comparisons: [], settings: { currency: 'USD' } };
  const m = migrate(v1);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(m.trees, []);
  assert.equal(m.settings.currency, 'USD');
  assert.equal(m.settings.ai.nCtx, 2048);
  assert.equal(v1.schemaVersion, 1);
  assert.throws(() => migrate({ ...v1, schemaVersion: 99 }), /newer app/);
  assert.throws(() => migrate({ hello: 1 }), /not a WHAT IF/);
});

test('export/import round trip; model records stay on the device', async () => {
  const st = await make();
  await st.update((s, now) => {
    s.scenarios.push(newScenario('career', { id: 'c1', name: 'Learn SQL', now, withExamples: true }));
    s.models.push({ id: 'm1', name: 'local model' });
  });
  const json = st.exportJSON();
  assert.ok(!json.includes('local model'));
  await st.wipe();
  assert.equal(st.state.scenarios.length, 0);
  await st.importJSON(json);
  assert.equal(st.state.scenarios[0].name, 'Learn SQL');
  await assert.rejects(st.importJSON('{"app":"other"}'), /not a WHAT IF/);
  await assert.rejects(st.importJSON('nope'), /valid JSON/);
});
