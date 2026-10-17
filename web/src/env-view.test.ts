// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { DEFS } from './modules';
import { addModule, connect, defaultParams, emptyPatch } from './patch';
import { dotX, envShape, ENV_SPECS } from './env-view';
import { Engine } from './engine';
import { encodePatch } from './patchbin';

const close = (a: number, b: number, tol = 0.02): void => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('envelope shapes', () => {
  it('ADSR: up to 1, down to the sustain, held, released to 0; the widths fill the row, longer times wider', () => {
    const p = { ...defaultParams(DEFS.adsr), a: 0.01, d: 0.5, s: 0.4, r: 2 };
    const segs = envShape('adsr', p);
    expect(segs.map((s) => s.stage)).toEqual([1, 2, 3, 4]);
    close(segs[0].ys.at(-1)!, 1);
    close(segs[1].ys.at(-1)!, 0.4);
    close(segs[2].ys[0], 0.4);
    close(segs[3].ys.at(-1)!, 0, 0.01);
    close(segs.at(-1)!.x1, 1, 1e-9);
    const w = (i: number): number => segs[i].x1 - segs[i].x0;
    expect(w(3)).toBeGreaterThan(w(1));
    expect(w(1)).toBeGreaterThan(w(0));
    expect(w(0)).toBeGreaterThanOrEqual(0.05 - 1e-9);
  });

  it('Env L/R: each segment ends at its level, the sustain holds l3, the release ends at l4', () => {
    const p = { ...defaultParams(DEFS.env), l1: 1, r1: 0.05, l2: 0.3, r2: 0.2, l3: 0.7, r3: 0.4, l4: 0.1, r4: 1 };
    const segs = envShape('env', p);
    expect(segs.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5]);
    close(segs[0].ys.at(-1)!, 1);
    close(segs[1].ys.at(-1)!, 0.3);
    close(segs[2].ys.at(-1)!, 0.7);
    close(segs[3].ys[0], 0.7);
    close(segs[4].ys.at(-1)!, 0.1);
  });

  it('places a copy on the shape by its stage and level', () => {
    const segs = envShape('adsr', { ...defaultParams(DEFS.adsr), a: 0.1, d: 0.3, s: 0.5, r: 1 });
    const x = dotX(segs, 1, 0.5)!;
    expect(x).toBeGreaterThan(segs[0].x0);
    expect(x).toBeLessThan(segs[0].x1);
    expect(dotX(segs, 3, 0.5)).toBe(segs[2].x0);
    expect(dotX(segs, 0, 0)).toBeNull();
  });

  it('the display is not a parameter: the binary and the engine are unchanged, the engine reports each copy', () => {
    for (const t of Object.keys(ENV_SPECS)) expect(DEFS[t].params.some((q) => q.name === 'view')).toBe(false);
    const p = emptyPatch('e');
    const kb = addModule(p, DEFS.fm1, 0, 0);
    const env = addModule(p, DEFS.adsr, 0, 0);
    connect(p, DEFS, { module: kb.id, port: 'gate' }, { module: env.id, port: 'gate' });
    expect(() => encodePatch(p)).not.toThrow();
    const e = new Engine(48000);
    e.load(p);
    e.noteOn(60);
    e.render(new Float32Array(512), new Float32Array(512));
    const st = e.envStates(env.id)!;
    expect(st).toHaveLength(1);
    expect(st[0].stage).toBeGreaterThan(0);
    expect(st[0].newest).toBe(true);
    expect(e.envStates(kb.id)).toBeNull();
  });
});
