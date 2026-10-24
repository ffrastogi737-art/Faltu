// Decision trees: decision nodes pick the best expected value, chance nodes weight by probability.
// node: { id, type: 'decision'|'chance'|'outcome', label, p? (when parent is chance), value?, link?: {scenarioId, metric}, children: [] }

import { SimError } from './validate.js';

const MAX_NODES = 120;
const MAX_DEPTH = 8;

export function validateTree(root) {
  let count = 0;
  const walk = (n, depth, parentType) => {
    if (++count > MAX_NODES) throw new SimError(`Trees are limited to ${MAX_NODES} nodes`);
    if (depth > MAX_DEPTH) throw new SimError(`Trees are limited to ${MAX_DEPTH} levels`);
    if (!['decision', 'chance', 'outcome'].includes(n?.type)) throw new SimError('Unknown node type');
    if (parentType === 'chance' && !(Number.isFinite(n.p) && n.p >= 0 && n.p <= 1)) throw new SimError(`“${n.label}” needs a probability between 0 and 1`);
    const kids = n.children || [];
    if (n.type === 'outcome') {
      if (kids.length) throw new SimError('Outcome nodes cannot have children');
      if (!n.link && !Number.isFinite(n.value)) throw new SimError(`Outcome “${n.label}” needs a value`);
      return;
    }
    if (!kids.length) throw new SimError(`“${n.label}” needs at least one branch`);
    if (n.type === 'chance') {
      const sum = kids.reduce((s, c) => s + (Number(c.p) || 0), 0);
      if (Math.abs(sum - 1) > 1e-6) throw new SimError(`Probabilities under “${n.label}” add up to ${(sum * 100).toFixed(1)}%, not 100%`);
    }
    kids.forEach((c) => walk(c, depth + 1, n.type));
  };
  walk(root, 1, null);
  return root;
}

/** resolveLink({scenarioId, metric}) -> number, throws if unavailable. Returns annotated copy. */
export function evaluateTree(root, resolveLink = () => { throw new SimError('Linked values unavailable'); }) {
  validateTree(root);
  const ev = (n) => {
    if (n.type === 'outcome') {
      const value = n.link ? resolveLink(n.link) : n.value;
      if (!Number.isFinite(value)) throw new SimError(`Outcome “${n.label}” has no numeric value`);
      return { ...n, ev: value };
    }
    const children = n.children.map(ev);
    if (n.type === 'chance') return { ...n, children, ev: children.reduce((s, c) => s + c.p * c.ev, 0) };
    const best = children.reduce((a, c) => (c.ev > a.ev ? c : a), children[0]);
    return { ...n, children, ev: best.ev, bestId: best.id };
  };
  return ev(root);
}
