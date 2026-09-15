import { describe, expect, it } from 'vitest';
import type { SoundingNote } from '@sudobility/music_types';
import {
  litKeys,
  playingPitchesForTrack,
  samePitchSet,
} from './playing-pitches.js';

const sounding = (
  noteId: string,
  trackId: string,
  midi: number
): SoundingNote => ({
  noteId,
  trackId,
  midi,
});

describe('playingPitchesForTrack', () => {
  it('is empty when nothing is playing', () => {
    expect(playingPitchesForTrack([], 'track-0').size).toBe(0);
  });

  it('is empty when there is no active track', () => {
    expect(
      playingPitchesForTrack([sounding('n1', 'track-0', 60)], null).size
    ).toBe(0);
  });

  it('returns the midi of a sounding note on the active track', () => {
    const pitches = playingPitchesForTrack(
      [sounding('n1', 'track-0', 67)],
      'track-0'
    );
    expect(pitches.has(67)).toBe(true);
  });

  it('ignores sounding notes on other tracks', () => {
    // Sounding on track 1, but track 0 is active — the key must stay dark.
    expect(
      playingPitchesForTrack([sounding('n1', 'track-1', 60)], 'track-0').size
    ).toBe(0);
  });

  it('picks out only the active track from a mixed sounding set', () => {
    const pitches = playingPitchesForTrack(
      [sounding('a', 'track-0', 60), sounding('b', 'track-1', 72)],
      'track-0'
    );
    expect(pitches.has(60)).toBe(true);
    expect(pitches.size).toBe(1);
  });

  it('collapses two voices sounding the same pitch on one track', () => {
    const pitches = playingPitchesForTrack(
      [sounding('a', 'track-0', 60), sounding('b', 'track-0', 60)],
      'track-0'
    );
    expect(pitches.size).toBe(1);
  });
});

describe('litKeys', () => {
  const notes = [sounding('n1', 'track-0', 60), sounding('n2', 'track-1', 64)];

  it('lights the active track while playing, plus held keys', () => {
    const lit = litKeys(notes, 'track-0', 'playing', new Set([72]));
    expect([...lit].sort()).toEqual([60, 72]);
  });

  it('lights nothing from the engine while paused, which does not clear it', () => {
    // The engine clears sounding notes on stop but not on pause; without the
    // gate whatever was mid-chord stays lit.
    expect([...litKeys(notes, 'track-0', 'paused', new Set())]).toEqual([]);
    expect([...litKeys(notes, 'track-0', 'stopped', [67])]).toEqual([67]);
  });

  it('never lights another track', () => {
    expect(litKeys(notes, 'track-0', 'playing', []).has(64)).toBe(false);
  });
});

describe('samePitchSet', () => {
  it('matches the same keys in any order', () => {
    expect(samePitchSet(new Set([60, 64]), new Set([64, 60]))).toBe(true);
    expect(samePitchSet(new Set(), new Set())).toBe(true);
  });

  it('tells a changed key from an unchanged one', () => {
    expect(samePitchSet(new Set([60, 64]), new Set([60, 65]))).toBe(false);
    expect(samePitchSet(new Set([60]), new Set([60, 64]))).toBe(false);
  });

  it('sees nothing change when another track’s note starts', () => {
    const before = playingPitchesForTrack([sounding('a', 't1', 60)], 't1');
    const after = playingPitchesForTrack(
      [sounding('a', 't1', 60), sounding('b', 't2', 67)],
      't1'
    );
    expect(samePitchSet(before, after)).toBe(true);
  });
});
