import { apply, createInitialState } from '../src/core/engine.js';

export const T0 = new Date(2026, 9, 21, 10, 0, 0).getTime(); // Wed 21 Oct 2026, 10:00 local
export const HOUR = 3600000;
export const DAY = 24 * HOUR;

/** Small harness: a game with a character, plus a `do` helper that applies actions immutably. */
export function newGame(now = T0) {
  const g = { state: createInitialState(now), now, events: [] };
  g.do = (action, payload, at = g.now) => {
    const r = apply(g.state, action, payload, at);
    g.state = r.state;
    g.events = r.events;
    return r.events;
  };
  g.do('createProfile', { name: 'Ada', focusSkillIds: ['programming'] });
  g.quest = (overrides = {}) => {
    g.do('createQuest', { title: 'Write tests', type: 'custom', difficulty: 2, estimatedMinutes: 30, skillId: 'programming', ...overrides });
    return g.state.quests[g.state.quests.length - 1];
  };
  return g;
}
