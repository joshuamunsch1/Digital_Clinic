// Deterministic L2-regularized logistic regression via full-batch gradient
// descent — small, dependency-free, reproducible (zero-init, fixed iteration
// count). Callers standardize inputs first (see features.ts) so the fixed
// learning rate is well-behaved.

export interface LogisticFit {
  weights: number[];
  bias: number;
}

export interface LogisticOptions {
  l2?: number;
  lr?: number;
  iters?: number;
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function trainLogistic(X: number[][], y: number[], opts: LogisticOptions = {}): LogisticFit {
  const l2 = opts.l2 ?? 0.01;
  const lr = opts.lr ?? 0.1;
  const iters = opts.iters ?? 800;
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const w = new Array<number>(p).fill(0);
  let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array<number>(p).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((s, v, j) => s + v * w[j], b);
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < p; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < p; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]); // bias unregularized
    b -= lr * (gb / n);
  }
  return { weights: w, bias: b };
}

export function predictLogistic(fit: LogisticFit, x: number[]): number {
  return sigmoid(x.reduce((s, v, j) => s + v * fit.weights[j], fit.bias));
}

/// Area under the ROC curve via the rank-sum (Mann-Whitney) formulation,
/// with tie halving. NaN when a class is absent.
export function auc(scores: number[], labels: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (!pos.length || !neg.length) return NaN;
  let sum = 0;
  for (const p of pos) {
    for (const q of neg) {
      if (p > q) sum += 1;
      else if (p === q) sum += 0.5;
    }
  }
  return sum / (pos.length * neg.length);
}
