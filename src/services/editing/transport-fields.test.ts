import { describe, expect, it } from 'vitest';
import { twinkleScore } from '@sudobility/music_types/test';
import { MAX_BPM, MIN_BPM } from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import { commitOpeningTempoText, openingTempoBpm } from './transport-fields.js';

describe('openingTempoBpm', () => {
  it('reads the first tempo event, rounded for the field', () => {
    const score = twinkleScore();
    score.tempoMap[0] = { ...score.tempoMap[0]!, bpm: 96.4 };
    expect(openingTempoBpm(score)).toBe(96);
  });

  it('falls back to the default tempo', () => {
    expect(openingTempoBpm(null)).toBe(120);
    expect(openingTempoBpm({ ...twinkleScore(), tempoMap: [] })).toBe(120);
  });
});

describe('commitOpeningTempoText', () => {
  it('writes a rounded, clamped tempo as one undo step', () => {
    const store = testEditingStore(twinkleScore());
    expect(commitOpeningTempoText(store, ' 100.6 ')).toBe(true);
    expect(store.getState().score!.tempoMap[0]!.bpm).toBe(101);
    expect(store.getState().canUndo).toBe(true);

    commitOpeningTempoText(store, '9999');
    expect(store.getState().score!.tempoMap[0]!.bpm).toBe(MAX_BPM);
    commitOpeningTempoText(store, '1');
    expect(store.getState().score!.tempoMap[0]!.bpm).toBe(MIN_BPM);
  });

  it('skips blank, non-numeric and unchanged text', () => {
    const store = testEditingStore(twinkleScore());
    const bpm = store.getState().score!.tempoMap[0]!.bpm;
    expect(commitOpeningTempoText(store, '')).toBe(false);
    expect(commitOpeningTempoText(store, 'fast')).toBe(false);
    expect(commitOpeningTempoText(store, String(bpm))).toBe(false);
    expect(store.getState().canUndo).toBe(false);
  });
});
