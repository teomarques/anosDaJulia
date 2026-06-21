// Utility helpers for the animation engine.
// Kept framework-agnostic and allocation-light so the main loop stays at 60fps.

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Clamp a value into [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Smoothstep easing: 0 at edge0, 1 at edge1, smooth in between. */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Even smoother easing (Ken Perlin). */
export const smootherstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Random float in [min, max). */
export const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

/** Random int in [min, max] inclusive. */
export const randInt = (min: number, max: number): number =>
  Math.floor(rand(min, max + 1));

/** Pick a random element from an array. */
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Distance between two points. */
export const dist = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.hypot(x2 - x1, y2 - y1);

/** Frame-rate independent exponential smoothing factor.
 *  `halfLife` is in seconds; `dt` is the frame delta in seconds. */
export const damp = (halfLife: number, dt: number): number =>
  1 - Math.pow(2, -dt / Math.max(halfLife, 1e-6));

/** Map a value from one range to another. */
export const mapRange = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => outMin + ((v - inMin) * (outMax - outMin)) / (inMax - inMin);

/** A tiny seeded PRNG (mulberry32) so shuffle order is reproducible if needed. */
export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher–Yates shuffle (returns a new array). */
export const shuffle = <T>(arr: T[]): T[] => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export interface Vec2 {
  x: number;
  y: number;
}
