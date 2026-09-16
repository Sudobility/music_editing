import { describe, expect, it } from 'vitest';
import {
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  TAP_SLOP,
  TOUCH_TAP_SLOP,
  classifyPress,
  tapSlopFor,
} from './press.js';

describe('classifyPress — mouse (the web editor)', () => {
  it('is a tap while the pointer stays within TAP_SLOP on both axes', () => {
    expect(classifyPress({ dx: 0, dy: 0, heldMs: 80 })).toBe('tap');
    expect(classifyPress({ dx: TAP_SLOP, dy: -TAP_SLOP, heldMs: 80 })).toBe(
      'tap'
    );
  });

  it('is a drag once either axis passes TAP_SLOP, as the box select was', () => {
    expect(classifyPress({ dx: TAP_SLOP + 1, dy: 0, heldMs: 80 })).toBe('drag');
    expect(classifyPress({ dx: 0, dy: -(TAP_SLOP + 1), heldMs: 80 })).toBe(
      'drag'
    );
  });

  it('never reads a held click as a long press: a mouse has a menu button', () => {
    expect(classifyPress({ dx: 0, dy: 0, heldMs: LONG_PRESS_MS * 4 })).toBe(
      'tap'
    );
  });
});

describe('classifyPress — touch (the native app)', () => {
  const touch = { pointer: 'touch' } as const;

  it('allows a finger more wander than a mouse before a tap stops being one', () => {
    expect(TOUCH_TAP_SLOP).toBeGreaterThan(TAP_SLOP);
    expect(classifyPress({ dx: 8, dy: 0, heldMs: 90, ...touch })).toBe('tap');
    expect(classifyPress({ dx: 8, dy: 0, heldMs: 90 })).toBe('drag');
  });

  it('is a long press when held LONG_PRESS_MS within LONG_PRESS_SLOP', () => {
    expect(
      classifyPress({ dx: 0, dy: 0, heldMs: LONG_PRESS_MS, ...touch })
    ).toBe('longPress');
    expect(
      classifyPress({
        dx: LONG_PRESS_SLOP,
        dy: 0,
        heldMs: LONG_PRESS_MS + 200,
        ...touch,
      })
    ).toBe('longPress');
  });

  it('is a tap when released just short of the long-press time', () => {
    expect(
      classifyPress({ dx: 0, dy: 0, heldMs: LONG_PRESS_MS - 1, ...touch })
    ).toBe('tap');
  });

  it('is a drag, not a long press, when a held finger travelled — a scroll that ended where it began', () => {
    expect(
      classifyPress({
        dx: LONG_PRESS_SLOP + 1,
        dy: 0,
        heldMs: LONG_PRESS_MS * 2,
        ...touch,
      })
    ).toBe('drag');
  });

  it('keeps the platform constants', () => {
    expect(LONG_PRESS_MS).toBe(500);
    expect(LONG_PRESS_SLOP).toBe(12);
    expect(TAP_SLOP).toBe(3);
    expect(tapSlopFor('mouse')).toBe(TAP_SLOP);
    expect(tapSlopFor('touch')).toBe(TOUCH_TAP_SLOP);
  });
});
