// Safe arithmetic expression language for custom scenarios. Parses to an AST; never uses eval.
// Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ;
//          unary := '-' unary | power ; power := primary ('^' unary)? ;
//          primary := number | ident | ident '(' args ')' | '(' expr ')'

import { SimError } from './validate.js';

export const FUNCTIONS = {
  min: { n: [1, 20], f: Math.min },
  max: { n: [1, 20], f: Math.max },
  abs: { n: [1, 1], f: Math.abs },
  round: { n: [1, 1], f: Math.round },
  floor: { n: [1, 1], f: Math.floor },
  ceil: { n: [1, 1], f: Math.ceil },
  sqrt: { n: [1, 1], f: Math.sqrt },
  pow: { n: [2, 2], f: Math.pow },
};

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

function tokenize(src) {
  if (typeof src !== 'string' || !src.trim()) throw new SimError('Formula is empty');
  if (src.length > 500) throw new SimError('Formula is too long (max 500 characters)');
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(.))/gy;
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined) {
      if (!'+-*/^(),'.includes(m[3])) throw new SimError(`Unexpected character “${m[3]}” in formula`);
      tokens.push({ t: m[3] });
    }
  }
  return tokens;
}

export function parse(src) {
  const tk = tokenize(src);
  let i = 0;
  const peek = () => tk[i];
  const eat = (t) => {
    if (tk[i]?.t !== t) throw new SimError(`Expected “${t}” in formula`);
    return tk[i++];
  };
  const expr = () => {
    let left = term();
    while (peek()?.t === '+' || peek()?.t === '-') left = { op: tk[i++].t, a: left, b: term() };
    return left;
  };
  const term = () => {
    let left = unary();
    while (peek()?.t === '*' || peek()?.t === '/') left = { op: tk[i++].t, a: left, b: unary() };
    return left;
  };
  // -2^2 = -(2^2) and 2^3^2 = 2^(3^2), as in ordinary maths.
  const unary = () => {
    if (peek()?.t === '-') { i++; return { op: 'neg', a: unary() }; }
    if (peek()?.t === '+') { i++; return unary(); }
    return power();
  };
  const power = () => {
    const base = primary();
    if (peek()?.t === '^') { i++; return { op: '^', a: base, b: unary() }; }
    return base;
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new SimError('Formula ends unexpectedly');
    if (t.t === 'num') { i++; return { num: t.v }; }
    if (t.t === '(') { i++; const e = expr(); eat(')'); return e; }
    if (t.t === 'id') {
      i++;
      if (peek()?.t === '(') {
        const fn = FUNCTIONS[t.v];
        if (!fn) throw new SimError(`Unknown function “${t.v}”`);
        i++;
        const args = [];
        if (peek()?.t !== ')') { args.push(expr()); while (peek()?.t === ',') { i++; args.push(expr()); } }
        eat(')');
        if (args.length < fn.n[0] || args.length > fn.n[1]) throw new SimError(`${t.v}() takes ${fn.n[0] === fn.n[1] ? fn.n[0] : `${fn.n[0]}–${fn.n[1]}`} argument(s)`);
        return { call: t.v, args };
      }
      return { id: t.v };
    }
    throw new SimError(`Unexpected “${t.t}” in formula`);
  };
  const ast = expr();
  if (i < tk.length) throw new SimError('Unexpected text at end of formula');
  return ast;
}

export function identifiers(ast, out = new Set()) {
  if (ast.id) out.add(ast.id);
  if (ast.a) identifiers(ast.a, out);
  if (ast.b) identifiers(ast.b, out);
  if (ast.args) ast.args.forEach((x) => identifiers(x, out));
  return out;
}

export function evaluate(ast, scope) {
  if (ast.num !== undefined) return ast.num;
  if (ast.id !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(scope, ast.id)) throw new SimError(`Unknown variable “${ast.id}”`);
    return scope[ast.id];
  }
  if (ast.call) return FUNCTIONS[ast.call].f(...ast.args.map((x) => evaluate(x, scope)));
  const a = evaluate(ast.a, scope);
  if (ast.op === 'neg') return -a;
  const b = evaluate(ast.b, scope);
  switch (ast.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': if (b === 0) throw new SimError('Division by zero'); return a / b;
    case '^': return Math.pow(a, b);
    default: throw new SimError('Bad formula');
  }
}

/** Formula with variable names replaced by their values, for the "show steps" panel. */
export function substitute(src, scope) {
  return src.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => (Object.prototype.hasOwnProperty.call(scope, name) && !FUNCTIONS[name] ? String(+scope[name].toFixed(4)) : name));
}
