// LocalAIProvider interface. Any implementation must provide:
//   id, label, status() -> { ready, reason }
//   interpret(text, { signal, onToken }) -> { ok, draft, errors, rejected, raw }
//   explain(factSheet, { signal, onToken }) -> string
// The simulation engine never depends on a provider; providers only produce drafts and prose.

import { interpretRules } from './rules.js';
import { validateDraft, DRAFT_JSON_SCHEMA } from './schema.js';

export class CancelledError extends Error { constructor() { super('Cancelled'); this.name = 'CancelledError'; } }

export class RuleProvider {
  id = 'rules';
  label = 'Rule-based assistant (no AI model)';
  status() { return { ready: true, reason: '' }; }
  async interpret(text) {
    const raw = interpretRules(text);
    return { ...validateDraft(raw), raw };
  }
  async explain(facts) { return facts; }
}

const SYSTEM_INTERPRET = `You convert a user's hypothetical situation into JSON for a decision simulator.
Rules:
- scenario_type: "business" for starting/running a business, "career" for learning a skill or changing careers, otherwise "custom".
- Only fill a value if the user stated that number. Use null for everything you are not told. Never guess or invent market data.
- Amounts are plain numbers (50k = 50000, 1 lakh = 100000). Percentages are numbers like 5 for 5%.
- business values: startingCash, initialInvestment, price, unitsPerMonth, variableCost, fixedMonthly, marketingMonthly, growthPct, months, taxPct.
- career values: currentLevel, targetLevel (0-10), hoursToTarget, hoursPerWeek, consistencyPct, completedHours, trainingCost, monthlyCost.
- assumptions: short notes about anything you interpreted, max 5.`;

const SYSTEM_EXPLAIN = `You explain decision-simulation results to a non-expert in 4-6 short sentences.
Use ONLY the numbers in the fact sheet. Do not calculate new numbers, do not predict the future, do not give financial guarantees.
Mention the biggest driver and one useful next experiment. Plain language, no markdown headings.`;

/** llama.cpp (WebAssembly build via wllama) running fully on this device. */
export class LlamaProvider {
  id = 'llama';
  constructor({ wasmUrl, moduleUrl }) {
    this.wasmUrl = wasmUrl;
    this.moduleUrl = moduleUrl;
    this.w = null;
    this.modelName = null;
  }

  get label() { return this.modelName ? `Local model: ${this.modelName}` : 'Local model (not loaded)'; }
  status() { return this.w?.isModelLoaded() ? { ready: true, reason: '' } : { ready: false, reason: 'No model loaded' }; }

  async load(blob, { name, nCtx = 2048, nThreads, useGpu = false } = {}) {
    await this.unload();
    let mod;
    try { mod = await import(this.moduleUrl); } catch (e) { throw new Error(`Local AI runtime could not start: ${e.message}`); }
    const quiet = { debug() {}, log() {}, info() {}, warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };
    this.w = new mod.Wllama({ default: this.wasmUrl }, { logger: quiet });
    try {
      await this.w.loadModel([blob], { n_ctx: nCtx, ...(nThreads ? { n_threads: nThreads } : {}), n_gpu_layers: useGpu ? 999 : 0 });
    } catch (e) {
      await this.unload();
      throw new Error(`Model failed to load: ${e?.message || e}`);
    }
    this.modelName = name || 'GGUF model';
    return { threads: this.w.getNumThreads?.(), multithread: this.w.isMultithread?.(), ctx: this.w.getLoadedContextInfo?.().n_ctx };
  }

  async unload() {
    if (this.w) { try { await this.w.exit(); } catch { /* already gone */ } }
    this.w = null;
    this.modelName = null;
  }

  async #chat(messages, { schema, maxTokens = 400, onToken, signal, temperature = 0.2 }) {
    if (!this.w?.isModelLoaded()) throw new Error('No local model is loaded');
    if (signal?.aborted) throw new CancelledError();
    let text = '';
    try {
      await this.w.createChatCompletion({
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature,
        abortSignal: signal,
        ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'scenario', schema, strict: true } } } : {}),
        onData: (chunk) => {
          const delta = chunk?.choices?.[0]?.delta?.content || '';
          if (delta) { text += delta; onToken?.(delta, text); }
        },
      });
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') throw new CancelledError();
      throw e;
    }
    if (signal?.aborted) throw new CancelledError();
    return text;
  }

  async interpret(text, opts = {}) {
    const raw = await this.#chat([
      { role: 'system', content: SYSTEM_INTERPRET },
      { role: 'user', content: String(text).slice(0, 2000) },
    ], { ...opts, schema: DRAFT_JSON_SCHEMA, temperature: 0, maxTokens: 500 });
    return { ...validateDraft(raw), raw };
  }

  async explain(facts, opts = {}) {
    return this.#chat([
      { role: 'system', content: SYSTEM_EXPLAIN },
      { role: 'user', content: facts },
    ], { ...opts, maxTokens: 300 });
  }
}
