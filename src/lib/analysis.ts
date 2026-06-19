// LanePulse Pro - Pure statistical helpers for analysis routes.
// All functions are pure (no DB / no IO) so they can be reused across routes.

/** Sum of an array of numbers (ignores non-finite). */
export function sum(nums: number[]): number {
  return nums.reduce<number>((acc, n) => (Number.isFinite(n) ? acc + n : acc), 0);
}

/** Average of an array. Returns null when empty. */
export function avg(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return sum(valid) / valid.length;
}

/** Minimum of an array. Returns null when empty. */
export function min(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

/** Maximum of an array. Returns null when empty. */
export function max(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

/** Population standard deviation. Returns null when empty. */
export function stddev(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  const mean = sum(valid) / valid.length;
  const variance = sum(valid.map((n) => (n - mean) ** 2)) / valid.length;
  return Math.sqrt(variance);
}

/** Round to N decimals (default 2). Returns 0 for non-finite. */
export function round(n: number | null | undefined, decimals = 2): number {
  if (n === null || n === undefined || !Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Round but allow null passthrough (for nullable stats). */
export function roundOrNull(n: number | null | undefined, decimals = 2): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Standard improvement bucket given the previous best and the latest time.
 * positive improvementSeconds => swimmer got faster (IMPROVED).
 */
export function improvementBucket(
  previousBest: number | null,
  latest: number | null
): {
  improvementSeconds: number | null;
  improvementPercent: number | null;
  status: "IMPROVED" | "SLOWER" | "SAME" | "NOT_ENOUGH_DATA";
} {
  if (previousBest === null || latest === null) {
    return {
      improvementSeconds: null,
      improvementPercent: null,
      status: "NOT_ENOUGH_DATA",
    };
  }
  const improvementSeconds = previousBest - latest; // >0 means faster/improved
  const improvementPercent =
    previousBest > 0 ? (improvementSeconds / previousBest) * 100 : null;
  let status: "IMPROVED" | "SLOWER" | "SAME" = "SAME";
  if (improvementSeconds > 0.01) status = "IMPROVED";
  else if (improvementSeconds < -0.01) status = "SLOWER";
  return {
    improvementSeconds,
    improvementPercent,
    status,
  };
}

/**
 * Direction bucket when comparing last vs previous.
 * changeSeconds = last - previous (negative => improved/faster).
 */
export function changeBucket(
  last: number | null,
  previous: number | null
): {
  changeSeconds: number | null;
  changePercent: number | null;
  direction: "IMPROVED" | "SLOWER" | "SAME" | "NOT_ENOUGH_DATA";
} {
  if (last === null || previous === null) {
    return {
      changeSeconds: null,
      changePercent: null,
      direction: "NOT_ENOUGH_DATA",
    };
  }
  const changeSeconds = last - previous; // negative => improved
  const changePercent = previous > 0 ? (changeSeconds / previous) * 100 : null;
  let direction: "IMPROVED" | "SLOWER" | "SAME" = "SAME";
  if (changeSeconds < -0.01) direction = "IMPROVED";
  else if (changeSeconds > 0.01) direction = "SLOWER";
  return {
    changeSeconds,
    changePercent,
    direction,
  };
}

/**
 * Compute lap-performance metrics from an array of per-lap aggregates.
 * Each entry: { lapNo, lapTimeSeconds, cumulativeSeconds }.
 */
export function computeLapPerformance(
  laps: { lapNo: number; lapTimeSeconds: number; cumulativeSeconds: number }[]
): {
  fastestLap: { lapNo: number; lapTimeSeconds: number } | null;
  slowestLap: { lapNo: number; lapTimeSeconds: number } | null;
  avgLap: number | null;
  dropOffPercent: number | null;
  consistencyScore: number | null;
  enduranceDrop: boolean;
} {
  if (laps.length === 0) {
    return {
      fastestLap: null,
      slowestLap: null,
      avgLap: null,
      dropOffPercent: null,
      consistencyScore: null,
      enduranceDrop: false,
    };
  }
  const sorted = [...laps].sort((a, b) => a.lapNo - b.lapNo);
  let fastest = sorted[0];
  let slowest = sorted[0];
  for (const l of sorted) {
    if (l.lapTimeSeconds < fastest.lapTimeSeconds) fastest = l;
    if (l.lapTimeSeconds > slowest.lapTimeSeconds) slowest = l;
  }
  const times = sorted.map((l) => l.lapTimeSeconds);
  const avgLap = avg(times);
  const sd = stddev(times);
  const consistencyScore =
    avgLap && avgLap > 0 && sd !== null ? (sd / avgLap) * 100 : null;
  const dropOffPercent =
    fastest.lapTimeSeconds > 0
      ? ((slowest.lapTimeSeconds - fastest.lapTimeSeconds) / fastest.lapTimeSeconds) * 100
      : null;
  const lastLap = sorted[sorted.length - 1];
  const enduranceDrop =
    avgLap !== null &&
    lastLap.lapTimeSeconds === slowest.lapTimeSeconds &&
    lastLap.lapTimeSeconds > avgLap * 1.1;
  return {
    fastestLap: { lapNo: fastest.lapNo, lapTimeSeconds: fastest.lapTimeSeconds },
    slowestLap: { lapNo: slowest.lapNo, lapTimeSeconds: slowest.lapTimeSeconds },
    avgLap,
    dropOffPercent,
    consistencyScore,
    enduranceDrop,
  };
}
