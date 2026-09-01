import { describe, expect, it } from 'vitest';
import { EMPTY_GROUP, pressKey, releaseKey } from './key-group.js';

describe('key grouping', () => {
  it('makes one note of one key', () => {
    const down = pressKey(EMPTY_GROUP, 60, 1000);
    const { finished, group } = releaseKey(down, 60, 1200);
    expect(finished).toEqual({ midis: [60], heldMs: 200 });
    expect(group).toEqual(EMPTY_GROUP);
  });

  it('makes one chord of keys held together', () => {
    let g = pressKey(EMPTY_GROUP, 60, 1000);
    g = pressKey(g, 64, 1020);
    g = pressKey(g, 67, 1040);
    // Lifting two of three keeps the group open.
    let r = releaseKey(g, 64, 1300);
    expect(r.finished).toBeNull();
    r = releaseKey(r.group, 60, 1310);
    expect(r.finished).toBeNull();
    r = releaseKey(r.group, 67, 1320);
    expect(r.finished?.midis).toEqual([60, 64, 67]);
  });

  it('holds the group open for the last finger, not the first', () => {
    let g = pressKey(EMPTY_GROUP, 60, 1000);
    g = pressKey(g, 64, 1100);
    const r = releaseKey(g, 60, 1200);
    // The first key is gone but 64 is still down: still one chord.
    expect(r.finished).toBeNull();
    expect(r.group.down).toEqual([64]);
  });

  it('times the group from the first key down to the last release', () => {
    let g = pressKey(EMPTY_GROUP, 60, 1000);
    g = pressKey(g, 64, 1500);
    const r = releaseKey(releaseKey(g, 60, 1600).group, 64, 2000);
    expect(r.finished?.heldMs).toBe(1000);
  });

  it('separates keys that do not overlap', () => {
    const first = releaseKey(pressKey(EMPTY_GROUP, 60, 0), 60, 100);
    expect(first.finished?.midis).toEqual([60]);
    const second = releaseKey(pressKey(first.group, 62, 200), 62, 300);
    expect(second.finished?.midis).toEqual([62]);
  });

  it('ignores a repeated press of a key already down', () => {
    let g = pressKey(EMPTY_GROUP, 60, 1000);
    g = pressKey(g, 60, 1010);
    expect(g.midis).toEqual([60]);
    expect(g.down).toEqual([60]);
  });

  it('ignores a release of a key that was never down', () => {
    expect(releaseKey(EMPTY_GROUP, 60, 100).finished).toBeNull();
  });
});
