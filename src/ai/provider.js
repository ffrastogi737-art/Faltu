// Optional AI goal planning. The app never requires this: any failure falls back to the local planner.
// The API key is supplied by the user at runtime, kept in a separate IndexedDB store, never exported or logged.

import { localPlan, validateDraft } from '../core/planner.js';

// Pinned so a CDN update cannot change code running against the user's key.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.0/+esm';

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'stages', 'quests'],
  properties: {
    explanation: { type: 'string' },
    stages: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['title', 'objective'], properties: { title: { type: 'string' }, objective: { type: 'string' } } },
    },
    quests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'criteria', 'difficulty', 'estimatedMinutes', 'stageIndex'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          criteria: { type: 'string' },
          difficulty: { type: 'integer' },
          estimatedMinutes: { type: 'integer' },
          stageIndex: { type: 'integer' },
        },
      },
    },
  },
};

const SYSTEM = `You plan real-life goals for a gamified self-improvement app.
Split the user's goal into 3-6 meaningful milestone stages (the last is the "final boss") and one concrete quest per stage.
Quests must be specific, verifiable, healthy and safe: never reward sleep deprivation, extreme exercise, skipping meals, gambling or neglecting responsibilities.
difficulty is an integer 1-5 rising gradually; estimatedMinutes is an integer 5-480 for one sitting; stageIndex is the 0-based stage the quest belongs to.
Keep titles under 70 characters. Return only the JSON object.`;

let sdkPromise;
const loadSdk = () => (sdkPromise ??= import(/* @vite-ignore */ SDK_URL).catch((e) => { sdkPromise = undefined; throw e; }));

function friendlyError(err, Anthropic) {
  if (Anthropic) {
    if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected.';
    if (err instanceof Anthropic.RateLimitError) return 'AI rate limit reached. Try again in a minute.';
    if (err instanceof Anthropic.APIConnectionTimeoutError) return 'AI request timed out.';
    if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service (offline?).';
    if (err instanceof Anthropic.InternalServerError) return 'AI service is temporarily unavailable.';
    if (err instanceof Anthropic.APIError) return `AI request failed (${err.status ?? 'error'}).`;
  }
  return 'AI unavailable.';
}

async function anthropicPlan(goal, { apiKey, model, timeoutMs, skillHint }) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await loadSdk());
  } catch {
    throw new Error('Could not load the AI client (offline?).');
  }
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: timeoutMs, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Goal: ${goal}${skillHint ? `\nMain skill: ${skillHint}` : ''}` }],
    });
  } catch (err) {
    throw new Error(friendlyError(err, Anthropic));
  }
  if (response.stop_reason === 'refusal') throw new Error('The AI declined this goal.');
  if (response.stop_reason === 'max_tokens') throw new Error('AI response was cut off.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch { throw new Error('AI returned malformed data.'); }
}

/**
 * Returns { source, explanation, stages, quests: [{ok, draft, errors, stageIndex}], warning? }.
 * Quests are only *drafts*; the UI must ask the user before adding any of them.
 */
export async function planGoal(goal, state, { skillId, apiKey, fetchPlan = anthropicPlan } = {}) {
  const { provider, model, timeoutMs } = state.settings.ai;
  let plan = null;
  let warning = '';
  if (provider === 'anthropic') {
    if (!apiKey) warning = 'No API key set. Used the local planner.';
    else if (globalThis.navigator && navigator.onLine === false) warning = 'Offline. Used the local planner.';
    else {
      try {
        const skillHint = state.skills.find((s) => s.id === skillId)?.name;
        plan = { ...(await fetchPlan(goal, { apiKey, model, timeoutMs, skillHint })), source: 'ai' };
      } catch (e) {
        warning = `${e.message} Used the local planner instead.`;
      }
    }
  }
  if (!plan) {
    const local = localPlan(goal, state, { skillId });
    if (!local.ok) return { ok: false, error: local.error };
    plan = local;
  }
  const stages = (Array.isArray(plan.stages) ? plan.stages : []).slice(0, 10)
    .map((s) => ({ title: String(s?.title ?? '').trim().slice(0, 80), objective: String(s?.objective ?? '').trim().slice(0, 500) }))
    .filter((s) => s.title);
  const quests = (Array.isArray(plan.quests) ? plan.quests : []).slice(0, 20).map((q) => ({
    ...validateDraft({ ...q, skillId: q?.skillId ?? skillId ?? plan.quests?.[0]?.skillId }, state),
    stageIndex: Number.isInteger(q?.stageIndex) ? q.stageIndex : null,
  }));
  return { ok: true, source: plan.source, explanation: String(plan.explanation || '').slice(0, 500), stages, quests, warning };
}
