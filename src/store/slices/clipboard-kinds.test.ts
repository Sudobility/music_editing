/**
 * Copy, Cut, Clear, Delete and Paste, for each of the three things a reader can
 * select.
 *
 * The distinction every test here is about is **Clear against Delete**. They
 * typecheck identically, they both leave less music than they found, and the
 * difference only shows up in what survives: a cleared bar keeps its number and
 * its markings, a deleted one takes the rest of the score up with it. Getting
 * them the wrong way round is invisible until somebody looks at bar 40.
 */
import { describe, expect, it } from 'vitest';
import { testEditingStore } from '../../test/store.js';
import { allNotes } from '@sudobility/music_types';
import { twoTrackScore } from '@sudobility/music_types/test';
import {
  canPasteInto,
  selectionKind,
} from '../../services/editing/selection-kind.js';
import {
  clearSelected,
  deleteSelected,
} from '../../services/editing/editing.js';
import type { EditorStoreApi } from '../editing-store.js';

function setup() {
  const store = testEditingStore();
  store.getState().setScore(twoTrackScore());
  return store;
}

const score = (store: EditorStoreApi) => store.getState().score!;
const notesOn = (store: EditorStoreApi, trackIndex: number) =>
  allNotes(score(store)).filter(
    n => n.trackId === score(store).tracks[trackIndex].id
  ).length;

function selectBars(store: EditorStoreApi, indices: number[]) {
  const ids = score(store)
    .tracks.flatMap(t => t.measures)
    .filter(m => indices.includes(m.index))
    .map(m => m.id);
  store.getState().selectMeasures(ids);
}

describe('selectionKind', () => {
  it('reads notes first, because a note selection carries a track too', () => {
    // Clicking a note leaves the track active, so reading tracks first would
    // make every note selection look like a track selection.
    expect(
      selectionKind({ eventIds: ['n'], measureIds: [], trackIds: ['t'] })
    ).toBe('notes');
    expect(
      selectionKind({ eventIds: [], measureIds: ['m'], trackIds: ['t'] })
    ).toBe('measures');
    expect(
      selectionKind({ eventIds: [], measureIds: [], trackIds: ['t'] })
    ).toBe('track');
    expect(
      selectionKind({ eventIds: [], measureIds: [], trackIds: [] })
    ).toBeNull();
  });
});

describe('canPasteInto', () => {
  it('offers paste only when the two are the same kind', () => {
    const track = { kind: 'track' as const, track: twoTrackScore().tracks[0] };
    expect(
      canPasteInto({ eventIds: [], measureIds: [], trackIds: ['t'] }, track)
    ).toBe(true);
    expect(
      canPasteInto({ eventIds: ['n'], measureIds: [], trackIds: [] }, track)
    ).toBe(false);
    expect(
      canPasteInto({ eventIds: [], measureIds: [], trackIds: [] }, track)
    ).toBe(false);
    expect(
      canPasteInto({ eventIds: [], measureIds: [], trackIds: ['t'] }, null)
    ).toBe(false);
  });
});

describe('a track selection', () => {
  it('copies the whole part, so paste can rebuild it', () => {
    const store = setup();
    store.getState().selectTrack(score(store).tracks[0].id);
    store.getState().copySelection();
    const clip = store.getState().clipboard;
    expect(clip?.kind).toBe('track');
  });

  it('clears to an empty part; deletes to no part at all', () => {
    const store = setup();
    const trackId = score(store).tracks[0].id;
    const name = score(store).tracks[0].name;

    store.getState().selectTrack(trackId);
    clearSelected(store);
    expect(score(store).tracks).toHaveLength(2);
    expect(score(store).tracks[0].id).toBe(trackId);
    expect(score(store).tracks[0].name).toBe(name);
    expect(notesOn(store, 0)).toBe(0);

    store.getState().selectTrack(trackId);
    deleteSelected(store);
    expect(score(store).tracks).toHaveLength(1);
    expect(score(store).tracks[0].id).not.toBe(trackId);
  });

  it('refuses to delete the last part, rather than leaving a score with none', () => {
    const store = setup();
    store.getState().selectTrack(score(store).tracks[0].id);
    deleteSelected(store);
    store.getState().selectTrack(score(store).tracks[0].id);
    deleteSelected(store);
    expect(score(store).tracks).toHaveLength(1);
  });

  it('pastes over the selected part, or in beside it', () => {
    const store = setup();
    const bassName = score(store).tracks[1].name;

    store.getState().selectTrack(score(store).tracks[1].id);
    store.getState().copySelection();

    store.getState().selectTrack(score(store).tracks[0].id);
    store.getState().paste(undefined, { scope: 'replace' });
    expect(score(store).tracks).toHaveLength(2);
    expect(score(store).tracks[0].name).toBe(bassName);

    store.getState().selectTrack(score(store).tracks[1].id);
    store.getState().paste(undefined, { scope: 'insert' });
    expect(score(store).tracks).toHaveLength(3);
    expect(score(store).tracks[1].name).toBe(bassName);
  });
});

describe('a measure selection', () => {
  it('copies a vertical slice, not one part of the bar', () => {
    // A bar is the same bar on every stave; a slice that held one part's would
    // paste back leaving the staves disagreeing about where bar 40 is.
    const store = setup();
    selectBars(store, [0, 1]);
    store.getState().copySelection();
    const clip = store.getState().clipboard;
    expect(clip?.kind).toBe('measures');
    if (clip?.kind !== 'measures') throw new Error('kind');
    expect(clip.count).toBe(2);
    expect(clip.slice.tracks).toHaveLength(2);
  });

  it('clears the bars in place; deletes them and moves the rest up', () => {
    const store = setup();
    const before = score(store).tracks[0].measures.length;

    selectBars(store, [1]);
    clearSelected(store);
    expect(score(store).tracks[0].measures).toHaveLength(before);
    expect(score(store).tracks.every(t => t.measures.length === before)).toBe(
      true
    );

    selectBars(store, [1]);
    deleteSelected(store);
    expect(
      score(store).tracks.every(t => t.measures.length === before - 1)
    ).toBe(true);
  });

  it('keeps a bar’s markings through a clear', () => {
    const store = setup();
    store.getState().setScore({
      ...score(store),
      tracks: score(store).tracks.map(track => ({
        ...track,
        measures: track.measures.map((m, i) =>
          i === 1 ? { ...m, repeatEnd: true } : m
        ),
      })),
    });
    selectBars(store, [1]);
    clearSelected(store);
    expect(score(store).tracks[0].measures[1].repeatEnd).toBe(true);
  });

  it('inserts bars into every track, so the parts stay aligned', () => {
    const store = setup();
    const before = score(store).tracks[0].measures.length;
    selectBars(store, [0, 1]);
    store.getState().copySelection();
    selectBars(store, [2]);
    store.getState().paste(undefined, { scope: 'insert' });
    expect(score(store).tracks.map(t => t.measures.length)).toEqual([
      before + 2,
      before + 2,
    ]);
  });

  it('replaces bars without changing how many there are', () => {
    const store = setup();
    const before = score(store).tracks[0].measures.length;
    selectBars(store, [0, 1]);
    store.getState().copySelection();
    selectBars(store, [2]);
    store.getState().paste(undefined, { scope: 'replace' });
    expect(score(store).tracks.map(t => t.measures.length)).toEqual([
      before,
      before,
    ]);
  });
});

describe('cut', () => {
  it('copies before it removes, whatever the kind', () => {
    // A cut that removed without copying is a delete nobody can undo by
    // pasting, which is the one thing cut promises.
    const store = setup();
    store.getState().selectTrack(score(store).tracks[0].id);
    store.getState().cutSelection({ closeGap: true });
    expect(store.getState().clipboard?.kind).toBe('track');
    expect(score(store).tracks).toHaveLength(1);
  });

  it('leaves the container behind when told not to close the gap', () => {
    const store = setup();
    const before = score(store).tracks[0].measures.length;
    selectBars(store, [1]);
    store.getState().cutSelection({ closeGap: false });
    expect(store.getState().clipboard?.kind).toBe('measures');
    expect(score(store).tracks[0].measures).toHaveLength(before);
  });
});
