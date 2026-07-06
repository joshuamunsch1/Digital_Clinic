// Deterministic PRNG for the simulated cohort: mulberry32 seeded with a fixed
// master seed, so `npm run db:reset` reproduces the identical dataset every
// time (and the sanity tests are stable).

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// Standard normal via Box–Muller.
export function normal(rng: Rng, mean = 0, sdev = 1): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return mean + sdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const bernoulli = (rng: Rng, p: number): boolean => rng() < p;

/// Integer in [lo, hi] inclusive.
export const uniformInt = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

/// Weighted categorical draw: [["a", .3], ["b", .7]].
export function categorical<T>(rng: Rng, options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, w] of options) {
    r -= w;
    if (r <= 0) return value;
  }
  return options[options.length - 1][0];
}

export const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
