// Small statistics toolbox for the analytics module. Percentiles use linear
// interpolation (R type 7 — the default of R's quantile() and numpy), so
// values verified against R match exactly.

export function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/// Sample standard deviation (n − 1). 0 for a single value.
export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}

/// p in [0, 1]. Linear interpolation between order statistics (R type 7).
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/// Pooled standard deviation of two windows, as used by the suddengains
/// package's stability criterion (Wiedemann et al. 2020):
/// √[((n1−1)·sd1² + (n2−1)·sd2²) / (n1 + n2 − 2)].
export function pooledSd(pre: number[], post: number[]): number {
  const n1 = pre.length;
  const n2 = post.length;
  if (n1 + n2 < 3) return NaN;
  const v1 = sd(pre) ** 2;
  const v2 = sd(post) ** 2;
  return Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
}

/// Ordinary least squares via normal equations with Gaussian elimination
/// (partial pivoting) and a tiny ridge on the diagonal for numerical safety.
/// X rows are observations WITHOUT an intercept column — one is prepended.
/// Returns [intercept, ...coefs], or null when the system is unsolvable.
export function olsFit(X: number[][], y: number[], ridge = 1e-8): number[] | null {
  const n = X.length;
  if (!n || y.length !== n) return null;
  const p = X[0].length + 1; // + intercept
  if (n < p) return null;
  // A = Xᵀ X (+ ridge·I), b = Xᵀ y, with the intercept column folded in.
  const row = (i: number) => [1, ...X[i]];
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = row(i);
    for (let j = 0; j < p; j++) {
      b[j] += xi[j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += xi[j] * xi[k];
    }
  }
  for (let j = 0; j < p; j++) A[j][j] += ridge;
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      [A[pivot], A[col]] = [A[col], A[pivot]];
      [b[pivot], b[col]] = [b[col], b[pivot]];
    }
    for (let r = col + 1; r < p; r++) {
      const f = A[r][col] / A[col][col];
      for (let k = col; k < p; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const beta = new Array<number>(p).fill(0);
  for (let r = p - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < p; k++) s -= A[r][k] * beta[k];
    beta[r] = s / A[r][r];
  }
  return beta;
}
