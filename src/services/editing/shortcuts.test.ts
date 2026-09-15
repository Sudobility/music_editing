/**
 * The binding table, tested without a DOM.
 *
 * That is the point of it living here: a desktop build gets these bindings by
 * calling the same function, and they can be checked without a browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findEvent,
  getMusicPosition,
  getMusicPositionSource,
  isNoteEvent,
  resetMusicPosition,
  ticksFor,
} from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import { twinkleScore } from '@sudobility/music_types/test';
import { runEditorShortcut } from './shortcuts.js';
import type { EditorKeyChord } from './shortcuts.js';

function makeStore() {
  const store = testEditingStore();
  store.getState().setScore(twinkleScore());
  return store;
}

const chord = (
  over: Partial<EditorKeyChord> & { key: string }
): EditorKeyChord => ({
  shift: false,
  alt: false,
  mod: false,
  ...over,
});

describe('runEditorShortcut', () => {
  beforeEach(() => {
    resetMusicPosition();
  });

  it('says when a key is not the editor’s, so the host keeps it', () => {
    // `false` is what stops the editor swallowing a key it has no use for.
    const store = makeStore();
    expect(runEditorShortcut(store, chord({ key: 'F5' }))).toBe(false);
    expect(runEditorShortcut(store, chord({ key: 'q', mod: true }))).toBe(
      false
    );
  });

  it('leaves note entry alone when a modifier is held', () => {
    // None of it takes a modifier, so a host or OS shortcut passing through is
    // never mistaken for a note.
    const store = makeStore();
    expect(runEditorShortcut(store, chord({ key: 'c', mod: true }))).toBe(true); // copy
    expect(runEditorShortcut(store, chord({ key: 'd', mod: true }))).toBe(
      false
    );
    expect(runEditorShortcut(store, chord({ key: 'd', alt: true }))).toBe(
      false
    );
  });

  it('resolves Shift marks above note entry', () => {
    // `Shift+G` arrives as "G", which `pitchForLetter` would otherwise happily
    // write as a note. This is the one ordering that is load-bearing.
    const store = makeStore();
    const before = store.getState().score;

    expect(runEditorShortcut(store, chord({ key: 'G', shift: true }))).toBe(
      true
    );

    // A glissando needs two notes and refuses one, so the score may be
    // unchanged — what matters is that no note was written.
    const after = store.getState().score!;
    expect(after.tracks[0].measures[0].voices[0].events.length).toBe(
      before!.tracks[0].measures[0].voices[0].events.length
    );
  });

  it('writes a note for a bare letter', () => {
    const store = makeStore();
    getMusicPositionSource().moveTo(0);

    expect(runEditorShortcut(store, chord({ key: 'c' }))).toBe(true);

    expect(getMusicPosition().reportedTick).toBeGreaterThan(0);
  });

  it('steps the caret on Alt+Arrow and moves the selection on a bare one', () => {
    const store = makeStore();
    getMusicPositionSource().moveTo(0);

    runEditorShortcut(store, chord({ key: 'ArrowRight', alt: true }));
    const stepped = getMusicPosition().reportedTick;
    expect(stepped).toBeGreaterThan(0);

    // A bare arrow is a selection move, and must not disturb the caret.
    runEditorShortcut(store, chord({ key: 'ArrowRight' }));
    expect(getMusicPosition().reportedTick).toBe(stepped);
  });

  it('sends Home and End to the bar, and to the score with the modifier', () => {
    const store = makeStore();
    getMusicPositionSource().moveTo(960);

    runEditorShortcut(store, chord({ key: 'Home' }));
    expect(getMusicPosition().reportedTick).toBe(0);

    runEditorShortcut(store, chord({ key: 'End', mod: true }));
    expect(getMusicPosition().reportedTick).toBeGreaterThan(0);
  });

  it('takes play/pause from the host rather than reaching for a transport', () => {
    const store = makeStore();
    const togglePlay = vi.fn();

    expect(runEditorShortcut(store, chord({ key: ' ' }), { togglePlay })).toBe(
      true
    );

    expect(togglePlay).toHaveBeenCalledTimes(1);
  });

  it('routes cut and paste through the host prompts when it has them', () => {
    // Cutting has two possible outcomes, and the shortcut must offer the same
    // choice the toolbar does.
    const store = makeStore();
    const requestCut = vi.fn();
    const requestPaste = vi.fn();

    runEditorShortcut(store, chord({ key: 'x', mod: true }), {
      requestCut,
      requestPaste,
    });
    runEditorShortcut(store, chord({ key: 'v', mod: true }), {
      requestCut,
      requestPaste,
    });

    expect(requestCut).toHaveBeenCalledTimes(1);
    expect(requestPaste).toHaveBeenCalledTimes(1);
  });

  it('falls back to the store actions for a host with no dialogs', () => {
    const store = makeStore();
    expect(runEditorShortcut(store, chord({ key: 'x', mod: true }))).toBe(true);
  });

  it('undoes, and redoes with Shift', () => {
    const store = makeStore();
    getMusicPositionSource().moveTo(0);
    runEditorShortcut(store, chord({ key: 'c' }));
    const written = store.getState().score;

    runEditorShortcut(store, chord({ key: 'z', mod: true }));
    expect(store.getState().score).not.toBe(written);

    // Note count rather than deep equality: redo mints fresh ids, so the
    // score is the same music without being the same object.
    runEditorShortcut(store, chord({ key: 'z', mod: true, shift: true }));
    expect(
      store.getState().score!.tracks[0].measures[0].voices[0].events.length
    ).toBe(written!.tracks[0].measures[0].voices[0].events.length);
  });

  it('chooses a note value from a digit and dots it', () => {
    const store = makeStore();

    runEditorShortcut(store, chord({ key: '2' }));
    const chosen = store.getState().snapGrid;

    runEditorShortcut(store, chord({ key: '.' }));
    expect(store.getState().snapGrid).not.toBe(chosen);
  });

  it('retimes the selection from a digit and a dot, as the toolbar does', () => {
    // A digit is the keyboard's note-value button, and that button does two
    // things: arms the next note and retimes what is selected. Doing only the
    // first made the key and the button mean different things.
    const store = makeStore();
    const note = store
      .getState()
      .score!.tracks[0]!.measures[0]!.voices[0]!.events.find(isNoteEvent)!;
    store.getState().setSelection({
      eventIds: [note.id],
      measureIds: [],
      trackIds: [],
    });

    runEditorShortcut(store, chord({ key: '4' }));
    const durationOf = () => {
      const id = store.getState().selection.eventIds[0] ?? note.id;
      const event = findEvent(store.getState().score!, id);
      return event?.durationTicks;
    };
    expect(store.getState().snapGrid).toBe('eighth');
    expect(durationOf()).toBe(ticksFor('eighth', 480));

    runEditorShortcut(store, chord({ key: '.' }));
    expect(store.getState().snapGrid).toBe('dotted-eighth');
    expect(durationOf()).toBe(ticksFor('dotted-eighth', 480));
  });

  it('claims a key whose control is unavailable, and does nothing with it', () => {
    // Swallowed rather than handed back: while playing, N passing through to
    // the page would be a key that sometimes types into something else.
    const store = makeStore();
    store.setTransport('playing');

    expect(runEditorShortcut(store, chord({ key: 'n' }))).toBe(true);
    expect(store.getState().noteInput).toBe(false);
  });
});
