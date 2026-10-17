// SPDX-License-Identifier: GPL-3.0-only
// The history a Scope module's screen draws from, kept in the audio thread per input (worklet.ts `view` messages).
// A short window keeps raw samples, twice the window so the screen can find a trigger crossing that still leaves a whole
// window after it; a long window keeps one min / max pair per screen column, so two seconds cost no more to send than
// a few milliseconds.

/** columns of a long window: about one per screen pixel of a wide card */
export const ROLL_COLS = 480;
/** the longest raw history (samples); a window longer than half of it rolls */
export const RAW_MAX = 8192;

/** what the screen gets: raw samples (oldest first) or min / max per column (oldest first) */
export type ViewData = { raw: Float32Array } | { min: Float32Array; max: Float32Array };

/** a window rolls (min / max columns) when its raw history would not fit */
export const rolls = (samples: number): boolean => samples * 2 > RAW_MAX;

export class ViewStream {
  private raw: Float32Array | null = null;
  private min: Float32Array | null = null;
  private max: Float32Array | null = null;
  private w = 0;
  /** samples per column (roll), and the column being filled */
  private per = 1;
  private n = 0;
  private lo = Infinity;
  private hi = -Infinity;

  constructor(samples: number) {
    const s = Math.max(1, Math.round(samples));
    if (rolls(s)) {
      this.min = new Float32Array(ROLL_COLS);
      this.max = new Float32Array(ROLL_COLS);
      this.per = s / ROLL_COLS;
    } else this.raw = new Float32Array(Math.max(256, 2 * s));
  }

  push(src: Float32Array | null, n: number): void {
    if (this.raw) {
      const r = this.raw;
      for (let i = 0; i < n; i++) {
        r[this.w] = src ? src[i] : 0;
        if (++this.w === r.length) this.w = 0;
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const v = src ? src[i] : 0;
      if (v < this.lo) this.lo = v;
      if (v > this.hi) this.hi = v;
      if (++this.n < this.per) continue;
      this.n -= this.per;
      this.min![this.w] = this.lo;
      this.max![this.w] = this.hi;
      if (++this.w === ROLL_COLS) this.w = 0;
      this.lo = Infinity;
      this.hi = -Infinity;
    }
  }

  /** the history, oldest first (a copy the caller may transfer) */
  data(): ViewData {
    const order = (b: Float32Array): Float32Array => {
      const out = new Float32Array(b.length);
      out.set(b.subarray(this.w));
      out.set(b.subarray(0, this.w), b.length - this.w);
      return out;
    };
    return this.raw ? { raw: order(this.raw) } : { min: order(this.min!), max: order(this.max!) };
  }
}
