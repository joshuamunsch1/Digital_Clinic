// The generic scoring engine: computeScaleScores() interprets Scale formulas
// against a response's raw answers. This is the digital equivalent of one legacy
// .sps syntax file per instrument (see docs/target-data-model.md).
//
// Design constraints:
// - Reverse-scoring is a per-item flag applied BEFORE any formula runs.
// - "custom" formulas use a tiny arithmetic expression language (numbers,
//   identifiers, + - * /, parentheses, abs/min/max) — never eval'd as JS, so
//   Instrument/Scale rows stay pure, auditable data.
// - Scales are evaluated in sortOrder and may reference earlier scale keys
//   (e.g. EDE-Q8 total = mean of the four subscales; SDQ total difficulties).
// - Missing answers: sum tolerates `missingTolerance` (default 0) missing items;
//   mean follows the SPSS MEAN convention (computed from whatever is present);
//   prorated_sum implements the DIKJ rule sum/(n-missing)*n, truncated.

import type { FormulaDef, ItemDef, RawAnswers, ScaleDef } from "./types";

export interface ScoreResult {
  scores: Record<string, number>;
  skipped: { key: string; reason: string }[];
}

type Env = Map<string, number | null>;

function itemNumeric(item: ItemDef, raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let v: number | null = null;
  if (typeof raw === "number") v = raw;
  else if (item.valueMap && raw in item.valueMap) v = item.valueMap[raw];
  else {
    const n = Number(raw);
    v = Number.isFinite(n) ? n : null;
  }
  if (v === null) return null;
  if (item.reverseScored) {
    const lo = item.min ?? 0;
    const hi = item.max;
    if (hi === undefined) return null; // can't reverse without a known range
    v = lo + hi - v;
  }
  return v;
}

// --- tiny expression evaluator (recursive descent) ---------------------------

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
    } else if ("+-*/(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else {
      throw new Error(`unexpected character '${c}' in expression`);
    }
  }
  return out;
}

const FUNCS: Record<string, (...args: number[]) => number> = {
  abs: (a) => Math.abs(a),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  trunc: (a) => Math.trunc(a),
  round: (a) => Math.round(a),
};

/// Evaluates an expression against the env. Returns null when any referenced
/// identifier is missing/unscoreable (propagates missingness instead of guessing).
export function evalExpression(src: string, env: Env): number | null {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function primary(): number | null {
    const tok = eat();
    if (!tok) throw new Error("unexpected end of expression");
    if (tok.t === "num") return tok.v;
    if (tok.t === "id") {
      const next = peek();
      if (next && next.t === "op" && next.v === "(") {
        const fn = FUNCS[tok.v];
        if (!fn) throw new Error(`unknown function '${tok.v}'`);
        eat(); // (
        const args: (number | null)[] = [];
        if (!(peek()?.t === "op" && peek()?.v === ")")) {
          args.push(expr());
          while (peek()?.t === "op" && peek()?.v === ",") { eat(); args.push(expr()); }
        }
        const close = eat();
        if (!(close && close.t === "op" && close.v === ")")) throw new Error("expected ')'");
        if (args.some((a) => a === null)) return null;
        return fn(...(args as number[]));
      }
      if (!env.has(tok.v)) throw new Error(`unknown identifier '${tok.v}'`);
      return env.get(tok.v) ?? null;
    }
    if (tok.t === "op" && tok.v === "(") {
      const v = expr();
      const close = eat();
      if (!(close && close.t === "op" && close.v === ")")) throw new Error("expected ')'");
      return v;
    }
    if (tok.t === "op" && tok.v === "-") {
      const v = primary();
      return v === null ? null : -v;
    }
    throw new Error(`unexpected token '${tok.v}'`);
  }

  function term(): number | null {
    let v = primary();
    while (peek()?.t === "op" && (peek()?.v === "*" || peek()?.v === "/")) {
      const op = eat() as { t: "op"; v: string };
      const r = primary();
      if (v === null || r === null) v = null;
      else v = op.v === "*" ? v * r : v / r;
    }
    return v;
  }

  function expr(): number | null {
    let v = term();
    while (peek()?.t === "op" && (peek()?.v === "+" || peek()?.v === "-")) {
      const op = eat() as { t: "op"; v: string };
      const r = term();
      if (v === null || r === null) v = null;
      else v = op.v === "+" ? v + r : v - r;
    }
    return v;
  }

  const result = expr();
  if (pos !== tokens.length) throw new Error("trailing tokens in expression");
  return result;
}

// --- formula evaluation -------------------------------------------------------

function applyFormula(f: FormulaDef, env: Env): number | null {
  switch (f.type) {
    case "sum": {
      const vals = f.items.map((id) => env.get(id) ?? null);
      const present = vals.filter((v): v is number => v !== null);
      const missing = vals.length - present.length;
      if (missing > (f.missingTolerance ?? 0)) return null;
      return present.reduce((a, b) => a + b, 0);
    }
    case "mean": {
      const vals = f.items.map((id) => env.get(id) ?? null);
      const present = vals.filter((v): v is number => v !== null);
      const maxMissing = f.missingTolerance ?? f.items.length - 1; // SPSS MEAN: any valid value suffices
      if (!present.length || vals.length - present.length > maxMissing) return null;
      return present.reduce((a, b) => a + b, 0) / present.length;
    }
    case "prorated_sum": {
      const vals = f.items.map((id) => env.get(id) ?? null);
      const present = vals.filter((v): v is number => v !== null);
      const total = f.totalItems ?? f.items.length;
      const missing = total - present.length;
      if (present.length === 0 || missing < 0) return null;
      const sum = present.reduce((a, b) => a + b, 0);
      return Math.trunc((sum / (total - missing)) * total);
    }
    case "custom": {
      if (!f.expression) return null;
      return evalExpression(f.expression, env);
    }
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/// Compute every scale score for one response. Scales are evaluated in
/// sortOrder; each computed scale is added to the environment so later
/// formulas can reference it by key.
export function computeScaleScores(
  items: ItemDef[],
  scales: ScaleDef[],
  rawAnswers: RawAnswers,
): ScoreResult {
  const env: Env = new Map();
  for (const item of items) env.set(item.id, itemNumeric(item, rawAnswers[item.id]));

  const scores: Record<string, number> = {};
  const skipped: { key: string; reason: string }[] = [];
  for (const scale of [...scales].sort((a, b) => a.sortOrder - b.sortOrder)) {
    try {
      const v = applyFormula(scale.formula, env);
      env.set(scale.key, v);
      if (v === null) skipped.push({ key: scale.key, reason: "not computable (missing answers or incomplete formula)" });
      else scores[scale.key] = round2(v);
    } catch (e) {
      env.set(scale.key, null);
      skipped.push({ key: scale.key, reason: (e as Error).message });
    }
  }
  return { scores, skipped };
}
