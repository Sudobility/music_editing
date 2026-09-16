import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  zoomIn,
  zoomOut,
} from './view-settings.js';
import { QUANTIZE_GRIDS, QUANTIZE_GRID_SHORT } from '@sudobility/music_types';

describe('zoom', () => {
  it('cannot be stepped past either limit', () => {
    // Enough presses that an unclamped ratio would be far outside.
    let zoom = 1;
    for (let i = 0; i < 20; i += 1) zoom = zoomIn(zoom);
    expect(zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 40; i += 1) zoom = zoomOut(zoom);
    expect(zoom).toBe(MIN_ZOOM);
  });

  it('steps by a ratio, so the change is the same at either end', () => {
    // Out then in returns to where it started, away from the limits.
    expect(zoomIn(zoomOut(2))).toBeCloseTo(2, 10);
  });

  it('clamps a value that arrives from outside', () => {
    // A persisted preference from an older build, or a pinch gesture.
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });
});

describe('quantize grids', () => {
  it('label every member', () => {
    // A Record rather than a parallel array: adding a grid fails to compile
    // until it is labelled, where an array would silently offer the old set.
    for (const grid of QUANTIZE_GRIDS) {
      expect(QUANTIZE_GRID_SHORT[grid]).toMatch(/^1\/\d+$/);
    }
  });
});
