import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { interpretRules, parseAmount, detectType } from '../src/ai/rules.js';
import { validateDraft, draftToScenario, DRAFT_JSON_SCHEMA } from '../src/ai/schema.js';
import { parseGGUFHeader, assessModel } from '../src/ai/gguf.js';
import { RuleProvider, LlamaProvider, CancelledError } from '../src/ai/provider.js';
import { readiness, runScenario } from '../src/engine/scenario.js';

const MODELS = new URL('../.models/', import.meta.url).pathname;

test('amount parsing handles currency symbols, separators and Indian/English scales', () => {
  assert.equal(parseAmount('₹50,000'), 50000);
  assert.equal(parseAmount('Rs 2.5 lakh'), 250000);
  assert.equal(parseAmount('1 crore'), 10000000);
  assert.equal(parseAmount('$12k'), 12000);
  assert.equal(parseAmount('3.5 million'), 3500000);
  assert.equal(parseAmount('no numbers'), null);
});

test('scenario type detection', () => {
  assert.equal(detectType('I have ₹50,000. What if I start an online business?'), 'business');
  assert.equal(detectType('What if I learn Python for 10 hours a week?'), 'career');
  assert.equal(detectType('What if my rent doubles?'), 'custom');
});

test('rules extract only stated numbers and leave the rest null', () => {
  const r = validateDraft(interpretRules('I have ₹50,000. What if I start an online business selling candles at ₹400 each, 30 orders a month, rent 5000 per month, for 12 months?'));
  assert.ok(r.ok);
  const v = r.draft.values;
  assert.equal(r.draft.scenario_type, 'business');
  assert.equal(r.draft.currency, 'INR');
  assert.equal(v.startingCash, 50000);
  assert.equal(v.price, 400);
  assert.equal(v.unitsPerMonth, 30);
  assert.equal(v.fixedMonthly, 5000);
  assert.equal(v.months, 12);
  assert.equal(v.variableCost, null); // never stated → not invented
  assert.ok(r.draft.missing_inputs.includes('variableCost'));
  assert.ok(!r.draft.missing_inputs.includes('price'));
});

test('rules: the spec example yields cash only and lists what is missing', () => {
  const r = validateDraft(interpretRules('I have ₹50,000. What if I start an online business?'));
  assert.equal(r.draft.values.startingCash, 50000);
  assert.deepEqual(r.draft.missing_inputs, ['initialInvestment', 'price', 'unitsPerMonth', 'variableCost', 'fixedMonthly', 'months']);
});

test('rules: career hours and costs', () => {
  const r = validateDraft(interpretRules('What if I learn data analysis with 6 hours a week, about 250 hours total, course costs ₹12,000?'));
  assert.equal(r.draft.scenario_type, 'career');
  assert.equal(r.draft.values.hoursPerWeek, 6);
  assert.equal(r.draft.values.hoursToTarget, 250);
  assert.equal(r.draft.values.trainingCost, 12000);
});

test('schema validation rejects malformed output and drops out-of-range values', () => {
  assert.equal(validateDraft('not json {').ok, false);
  assert.equal(validateDraft('[1,2]').ok, false);
  assert.equal(validateDraft({ scenario_type: 'crypto' }).ok, false);
  const r = validateDraft({ scenario_type: 'business', title: 'x', currency: 'inr', values: { price: -5, months: 3.5, unitsPerMonth: '40', startingCash: 1000, hoursPerWeek: 9, evil: 'rm -rf' }, assumptions: ['ok', 7, ''] });
  assert.ok(r.ok);
  assert.equal(r.draft.values.price, null);
  assert.equal(r.draft.values.months, null);
  assert.equal(r.draft.values.unitsPerMonth, null); // strings are not numbers
  assert.equal(r.draft.values.startingCash, 1000);
  assert.equal(r.draft.currency, null); // must be an uppercase ISO code
  assert.deepEqual(r.draft.assumptions, ['ok']);
  assert.equal(r.rejected.length, 5);
  assert.ok(r.draft.missing_inputs.includes('price'));
});

test('the model is never trusted for missing_inputs', () => {
  const r = validateDraft({ scenario_type: 'career', title: 't', currency: null, values: {}, missing_inputs: [], assumptions: [] });
  assert.deepEqual(r.draft.missing_inputs, ['currentLevel', 'targetLevel', 'hoursToTarget', 'hoursPerWeek']);
});

test('AI drafts become scenarios that must be confirmed before running', () => {
  const { draft } = validateDraft({ scenario_type: 'business', title: 'Cafe', currency: 'INR', values: { startingCash: 100000, price: 150, unitsPerMonth: 600, variableCost: 60, fixedMonthly: 40000, months: 12, initialInvestment: 30000 }, assumptions: [] });
  const s = draftToScenario(draft, { id: 's1', now: 0, source: 'ai' });
  assert.equal(s.inputs.price.source, 'ai');
  assert.equal(readiness(s).ready, false);
  assert.throws(() => runScenario(s), /Confirm/);
  for (const k of Object.keys(s.inputs)) if (s.inputs[k].source === 'ai') s.inputs[k].source = 'fact';
  assert.equal(runScenario(s).summary.totalRevenue, 150 * 600 * 12);
});

test('JSON schema covers every simulator field and nothing executable', () => {
  const keys = Object.keys(DRAFT_JSON_SCHEMA.properties.values.properties);
  assert.ok(keys.includes('startingCash') && keys.includes('hoursPerWeek'));
  assert.equal(DRAFT_JSON_SCHEMA.additionalProperties, false);
});

test('rule provider is always ready', async () => {
  const p = new RuleProvider();
  assert.equal(p.status().ready, true);
  const r = await p.interpret('What if I learn guitar 3 hours a week?');
  assert.equal(r.draft.values.hoursPerWeek, 3);
});

test('llama provider reports unavailability and load failures clearly', async () => {
  const p = new LlamaProvider({ wasmUrl: 'x.wasm', moduleUrl: 'file:///definitely/missing/wllama.js' });
  assert.equal(p.status().ready, false);
  await assert.rejects(p.interpret('hi'), /No local model is loaded/);
  await assert.rejects(p.load(new Blob([new Uint8Array(4)])), /runtime could not start/);
  assert.equal(p.status().ready, false);
  const ac = new AbortController();
  ac.abort();
  p.w = { isModelLoaded: () => true };
  await assert.rejects(p.explain('facts', { signal: ac.signal }), CancelledError);
});

const header = (file, bytes = 8 * 1024 * 1024) => {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(bytes, statSync(file).size));
  readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
};

test('GGUF header: rejects non-GGUF files', () => {
  assert.throws(() => parseGGUFHeader(new TextEncoder().encode('PK\u0003\u0004 not a model at all').buffer), /Not a GGUF/);
});

test('GGUF header: reads a real tiny model', { skip: !existsSync(`${MODELS}stories260K.gguf`) && 'test model not downloaded' }, () => {
  const m = parseGGUFHeader(readFileSync(`${MODELS}stories260K.gguf`).buffer);
  assert.equal(m.architecture, 'llama');
  assert.ok(m.blockCount > 0 && m.embeddingLength > 0);
  assert.equal(m.complete, true);
});

test('GGUF header: reads Qwen2.5 0.5B metadata from the first 8 MB', { skip: !existsSync(`${MODELS}qwen2.5-0.5b-instruct-q4_k_m.gguf`) && 'model not downloaded' }, () => {
  const file = `${MODELS}qwen2.5-0.5b-instruct-q4_k_m.gguf`;
  const m = parseGGUFHeader(header(file));
  assert.equal(m.architecture, 'qwen2');
  assert.equal(m.quantization, 'Q4_K_M');
  assert.equal(m.contextLength, 32768);
  assert.equal(m.blockCount, 24);
  const a = assessModel(m, statSync(file).size, 2048, 4);
  assert.equal(a.compatible, true);
  // KV cache: 2 × 24 layers × 2048 ctx × (896 × 2/14) × 2 bytes ≈ 24 MB
  assert.equal(a.kvBytes, 2 * 24 * 2048 * (896 * (2 / 14)) * 2);
});

test('model assessment flags oversize, unknown and over-long context', () => {
  const meta = { architecture: 'mystery', quantization: 'F16', contextLength: 2048, blockCount: 2, embeddingLength: 64, headCount: 2, headCountKv: 2 };
  const a = assessModel(meta, 3 * 1024 ** 3, 4096, 4);
  assert.equal(a.compatible, false);
  assert.ok(a.problems.some((p) => /2 GB/.test(p)));
  assert.ok(a.problems.some((p) => /Context length/.test(p)));
  assert.ok(a.notes.some((n) => /not on the tested list/.test(n)));
  assert.ok(a.notes.some((n) => /Unquantized/.test(n)));
});
