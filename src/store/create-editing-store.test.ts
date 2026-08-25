/**
 * Two documents, two stores, no shared state.
 *
 * This is the reason the package exists. A native app with several scores open
 * needs one editing store per document; slices written against a single global
 * `AppState` cannot give it that, which is what they were before this split.
 */
import { describe, expect, it } from 'vitest';
import { twinkleScore, twoTrackScore } from '@sudobility/music_types/test';
import { changeMetadataCommand } from '@sudobility/music_types';
import { createEditingStore } from './create-editing-store.js';

describe('createEditingStore', () => {
  it('gives each document its own score, selection and history', () => {
    const a = createEditingStore();
    const b = createEditingStore();
    a.getState().setScore(twinkleScore());
    b.getState().setScore(twoTrackScore());

    a.getState().dispatchCommand(
      changeMetadataCommand({ title: 'Only A' }, 'Rename')
    );

    expect(a.getState().score?.metadata.title).toBe('Only A');
    expect(b.getState().score?.metadata.title).not.toBe('Only A');
    // History is per document: A can undo, B has nothing to undo.
    expect(a.getState().canUndo).toBe(true);
    expect(b.getState().canUndo).toBe(false);
  });

  it('keeps selections apart', () => {
    const a = createEditingStore();
    const b = createEditingStore();
    a.getState().setSelection({
      eventIds: ['x'],
      measureIds: [],
      trackIds: [],
    });

    expect(a.getState().selection.eventIds).toEqual(['x']);
    expect(b.getState().selection.eventIds).toEqual([]);
  });

  it('reports dirty to whoever asked, per document', () => {
    // Saving is not editing's job, so the store says the document changed and
    // whoever owns persistence decides what that means. Per store, so two
    // open documents do not save each other.
    let aDirty = 0;
    let bDirty = 0;
    const a = createEditingStore({ onChanged: () => (aDirty += 1) });
    const b = createEditingStore({ onChanged: () => (bDirty += 1) });
    b.getState().setScore(twoTrackScore());
    a.getState().setScore(twinkleScore());
    a.getState().dispatchCommand(
      changeMetadataCommand({ title: 'Edited' }, 'Rename')
    );

    // A edited; B only loaded a score, which is not an edit.
    expect(aDirty).toBeGreaterThan(0);
    expect(bDirty).toBe(0);
  });

  it('needs no backend context, no DOM and no transport', () => {
    // What the constructor does NOT take is the point: editing depends on none
    // of them, and building the whole application store to press a key was the
    // symptom that it had been written as though it did.
    const store = createEditingStore();
    expect(store.getState().state).toBe('stopped');
    expect(store.getState().score).toBeNull();
  });

  it('refuses a content edit while its own transport is playing', () => {
    // The edit lock is per document too: one score playing must not freeze
    // editing in another.
    const store = createEditingStore();
    store.getState().setScore(twinkleScore());
    store.setState(draft => {
      draft.state = 'playing';
    });
    const before = store.getState().score;

    store
      .getState()
      .dispatchCommand(
        changeMetadataCommand({ title: 'While playing' }, 'Rename')
      );

    expect(store.getState().score).toBe(before);
  });
});
