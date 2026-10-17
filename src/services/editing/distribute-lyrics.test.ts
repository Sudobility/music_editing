import { describe, expect, it } from 'vitest';
import { twinkleScore } from '@sudobility/music_types/test';
import { allNotes, isNoteEvent, syllabifyText } from '@sudobility/music_types';
import type { Score } from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import { distributeLyrics } from './editing.js';

function makeStore(score: Score = twinkleScore()) {
  const store = testEditingStore();
  store.getState().setScore(score);
  return store;
}

const lyricsOn = (score: Score, trackId: string): Array<string | null> =>
  allNotes(score)
    .filter(isNoteEvent)
    .filter(n => n.trackId === trackId)
    .sort((a, b) => a.startTick - b.startTick)
    .map(n => n.lyric?.text ?? null);

describe('distributeLyrics', () => {
  it('lays a whole line across the melody, as one undoable edit', () => {
    const store = makeStore();
    const trackId = store.getState().score!.tracks[0].id;

    const result = distributeLyrics(
      store,
      trackId,
      syllabifyText('twin-kle lit-tle star', 'en')
    );

    expect(result.applied).toBe(5);
    const after = lyricsOn(store.getState().score!, trackId);
    expect(after.slice(0, 5)).toEqual(['twin', 'kle', 'lit', 'tle', 'star']);

    // One undo step restores the wordless melody.
    store.getState().undo();
    expect(
      lyricsOn(store.getState().score!, trackId).every(l => l === null)
    ).toBe(true);
  });

  it('holds the last word across any trailing notes (a melisma)', () => {
    const store = makeStore();
    const trackId = store.getState().score!.tracks[0].id;
    const noteCount = lyricsOn(store.getState().score!, trackId).length;

    const result = distributeLyrics(store, trackId, [{ text: 'oh' }]);
    expect(result.applied).toBe(1);
    const after = lyricsOn(store.getState().score!, trackId);
    expect(after[0]).toBe('oh');
    // Every note after the first is a wordless melisma extension.
    expect(after.slice(1).every(l => l === null)).toBe(true);
    expect(after).toHaveLength(noteCount);
  });

  it('reports words that do not fit the tune', () => {
    const store = makeStore();
    const trackId = store.getState().score!.tracks[0].id;
    const noteCount = lyricsOn(store.getState().score!, trackId).length;

    const tooMany = Array.from({ length: noteCount + 3 }, (_, i) => ({
      text: `w${i}`,
    }));
    const result = distributeLyrics(store, trackId, tooMany);
    expect(result.applied).toBe(noteCount);
    expect(result.leftover).toHaveLength(3);
  });
});
