/**
 * The editing bar's rules, tested without a bar.
 *
 * Both apps draw this toolbar and each wrote out when every control is
 * available; these are those rules stated once, so the tests read as the
 * specification the two bars now share.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  changeTrackPropsCommand,
  getMusicPosition,
  getMusicPositionSource,
  isNoteEvent,
  moveNotesCommand,
  resetMusicPosition,
  setPickupCommand,
} from '@sudobility/music_types';
import { twinkleScore, twoTrackScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import { selectEffectiveEditMode } from '../../store/selectors.js';
import {
  addTrackChoices,
  editModeHintKey,
  goToBarFromInput,
  insertDefaultNoteAtCaret,
  quantizeSelectionToGrid,
  runAddTrackChoice,
  runMoreAction,
  selectToolbarAvailability,
  trackPickerVisible,
  voiceHintKey,
} from './toolbar.js';
import {
  EDITOR_MORE_ACTIONS,
  EDITOR_VOICE_COUNT,
  TOOLBAR_CONTROLS,
} from '@sudobility/music_types';

function notesOf(store: ReturnType<typeof testEditingStore>): string[] {
  const score = store.getState().score!;
  return score.tracks.flatMap(t =>
    t.measures.flatMap(m =>
      m.voices.flatMap(v => v.events.filter(isNoteEvent).map(e => e.id))
    )
  );
}

/** Makes the first track a flute, which plays one note at a time. */
function makeMonophonic(store: ReturnType<typeof testEditingStore>): void {
  const track = store.getState().score!.tracks[0]!;
  store
    .getState()
    .dispatchCommand(
      changeTrackPropsCommand(
        track.id,
        { midiProgram: 73, instrumentName: 'Flute' },
        'x'
      )
    );
}

describe('selectToolbarAvailability', () => {
  beforeEach(() => resetMusicPosition());

  it('offers nothing but the view with no score', () => {
    const availability = selectToolbarAvailability(
      testEditingStore().getState()
    );
    for (const control of TOOLBAR_CONTROLS)
      expect(availability[control], control).toBe(false);
  });

  it('leaves selection-bound controls off until something is selected', () => {
    const store = testEditingStore(twinkleScore());
    const a = selectToolbarAvailability(store.getState());
    expect(a.noteDuration).toBe(true);
    expect(a.insertNote).toBe(true);
    expect(a.accidental).toBe(false);
    expect(a.quantize).toBe(false);
    expect(a.slur).toBe(false);
    expect(a.fermata).toBe(false);
  });

  it('needs two notes for a span and one for a mark on a note', () => {
    const store = testEditingStore(twinkleScore());
    const [first, second] = notesOf(store);
    store.getState().setSelection({
      eventIds: [first!],
      measureIds: [],
      trackIds: [],
    });
    let a = selectToolbarAvailability(store.getState());
    expect(a.fermata).toBe(true);
    expect(a.slur).toBe(false);
    expect(a.glissando).toBe(false);

    store.getState().setSelection({
      eventIds: [first!, second!],
      measureIds: [],
      trackIds: [],
    });
    a = selectToolbarAvailability(store.getState());
    expect(a.slur).toBe(true);
    expect(a.crescendo).toBe(true);
    expect(a.glissando).toBe(true);
  });

  it('locks content while playing — lyrics, bars and glissando included', () => {
    const store = testEditingStore(twinkleScore());
    const [first, second] = notesOf(store);
    store.getState().setSelection({
      eventIds: [first!, second!],
      measureIds: [],
      trackIds: [],
    });
    store.setTransport('playing');
    const a = selectToolbarAvailability(store.getState());
    for (const locked of [
      'addTrack',
      'accidental',
      'insertNote',
      'noteInput',
      'enterLyrics',
      'addMeasure',
      'deleteMeasure',
      'glissando',
      'quantize',
    ] as const)
      expect(a[locked], locked).toBe(false);
    // Reading and arming stay live: the duration also sets the next note's
    // length, and nothing about going to a bar edits the score.
    for (const live of [
      'noteDuration',
      'dotted',
      'voice',
      'selectAll',
      'goToBar',
      'moreActions',
    ] as const)
      expect(a[live], live).toBe(true);
  });

  it('refuses stacking on an instrument that cannot play a chord', () => {
    const store = testEditingStore(twinkleScore());
    expect(selectToolbarAvailability(store.getState()).stackMode).toBe(true);
    makeMonophonic(store);
    expect(selectToolbarAvailability(store.getState()).stackMode).toBe(false);
  });

  it('returns the same object while nothing it reads has changed', () => {
    // Handed straight to a store hook, a fresh object per call re-renders on
    // every store write — and zustand warns about exactly that.
    const store = testEditingStore(twinkleScore());
    const first = selectToolbarAvailability(store.getState());
    store.getState().setZoom(2);
    expect(selectToolbarAvailability(store.getState())).toBe(first);
  });
});

describe('edit mode', () => {
  it('falls back from stack where the track cannot stack', () => {
    const store = testEditingStore(twinkleScore());
    store.getState().setEditMode('stack');
    expect(selectEffectiveEditMode(store.getState())).toBe('stack');
    makeMonophonic(store);
    expect(selectEffectiveEditMode(store.getState())).toBe('replace');
    store.getState().setEditMode('insert');
    expect(selectEffectiveEditMode(store.getState())).toBe('insert');
  });

  it('explains an unavailable stack mode instead of describing it', () => {
    expect(editModeHintKey('insert', true)).toBe('editor.insertModeHint');
    expect(editModeHintKey('stack', true)).toBe('editor.stackModeHint');
    expect(editModeHintKey('stack', false)).toBe('editor.stackModeUnavailable');
    expect(editModeHintKey('replace', false)).toBe('editor.replaceModeHint');
  });
});

describe('toolbar actions', () => {
  beforeEach(() => resetMusicPosition());

  it('offers two voices, each with its own hint', () => {
    expect(EDITOR_VOICE_COUNT).toBe(2);
    expect(voiceHintKey(0)).toBe('editor.voice1Hint');
    expect(voiceHintKey(1)).toBe('editor.voice2Hint');
  });

  it('inserts the default note and advances the caret past it', () => {
    const store = testEditingStore(twinkleScore());
    getMusicPositionSource().moveTo(0);
    const before = store.getState().score;
    insertDefaultNoteAtCaret(store);
    expect(store.getState().score).not.toBe(before);
    expect(getMusicPosition().reportedTick).toBe(480);
  });

  it('quantizes the selection on a named grid', async () => {
    const store = testEditingStore(twinkleScore());
    const [first] = notesOf(store);
    store.getState().setSelection({
      eventIds: [first!],
      measureIds: [],
      trackIds: [],
    });
    // Nudged off the grid first, so there is something to put back.
    store
      .getState()
      .dispatchCommand(
        moveNotesCommand([first!], { deltaTicks: 7, deltaSemitones: 0 }, 'x')
      );
    const nudged = notesOf(store);
    store.getState().setSelection({
      eventIds: nudged,
      measureIds: [],
      trackIds: [],
    });
    await quantizeSelectionToGrid(store, 'sixteenth');
    // The move was labelled 'x'; the quantize after it is labelled by the
    // copy table, which is empty in a test — so a changed label is the proof.
    expect(store.getState().undoLabel).toBe('');
  });

  it('goes to a bar by the number a reader sees, pickup and all', () => {
    const store = testEditingStore(twinkleScore());
    store.getState().dispatchCommand(setPickupCommand(1, 'x'));
    const measures = store.getState().score!.tracks[0]!.measures;

    // Bar 1 is the first counted bar: index 1, not the pickup at index 0.
    expect(goToBarFromInput(store, ' 1 ')).toBe(true);
    expect(getMusicPosition().reportedTick).toBe(measures[1]!.startTick);
  });

  it('is the only way to a bar: the index-counting caretToBar is gone', async () => {
    // It counted `index + 1` and landed one bar early after a pickup. Kept
    // exported with no caller, it is the obvious thing for a new prompt to
    // reach for.
    const index: Record<string, unknown> = await import('../../index.js');
    expect(index).not.toHaveProperty('caretToBar');
  });

  it('refuses a bar that is not there and text that is not a number', () => {
    const store = testEditingStore(twinkleScore());
    getMusicPositionSource().moveTo(5);
    expect(goToBarFromInput(store, '')).toBe(false);
    expect(goToBarFromInput(store, 'abc')).toBe(false);
    expect(goToBarFromInput(store, '0')).toBe(false);
    expect(goToBarFromInput(store, '9999')).toBe(false);
    expect(getMusicPosition().reportedTick).toBe(5);
  });

  it('lists both add-track answers, disabling Generate with nowhere to send it', () => {
    expect(addTrackChoices({ canGenerate: true })).toEqual([
      {
        value: 'blank',
        labelKey: 'editor.blankTrack',
        hintKey: 'editor.blankTrackHint',
        disabled: false,
      },
      {
        value: 'generate',
        labelKey: 'editor.generateTrack',
        hintKey: 'editor.generateTrackHint',
        disabled: false,
      },
    ]);
    const [, generate] = addTrackChoices({ canGenerate: false });
    expect(generate).toMatchObject({
      disabled: true,
      hintKey: 'editor.generateTrackUnavailable',
    });
  });

  it('adds a blank track, and refuses either answer while playing', () => {
    const store = testEditingStore(twinkleScore());
    let generated = 0;
    const host = { generateTrack: () => (generated += 1) };
    runAddTrackChoice(store, 'blank', host);
    expect(store.getState().score!.tracks).toHaveLength(2);

    store.setTransport('playing');
    runAddTrackChoice(store, 'blank', host);
    runAddTrackChoice(store, 'generate', host);
    expect(store.getState().score!.tracks).toHaveLength(2);
    expect(generated).toBe(0);
  });

  it('runs the More menu, refusing what is locked', () => {
    expect(EDITOR_MORE_ACTIONS.map(a => a.value)).toEqual([
      'select-all',
      'add-measure',
      'delete-measure',
      'go-to-bar',
      'enter-lyrics',
      'glissando',
    ]);
    const store = testEditingStore(twinkleScore());
    const opened: string[] = [];
    const host = {
      goToBar: () => opened.push('bar'),
      enterLyrics: () => opened.push('lyrics'),
    };
    const bars = store.getState().score!.tracks[0]!.measures.length;
    runMoreAction(store, 'add-measure', host);
    expect(store.getState().score!.tracks[0]!.measures).toHaveLength(bars + 1);

    store.setTransport('playing');
    runMoreAction(store, 'add-measure', host);
    runMoreAction(store, 'enter-lyrics', host);
    runMoreAction(store, 'go-to-bar', host);
    expect(store.getState().score!.tracks[0]!.measures).toHaveLength(bars + 1);
    expect(opened).toEqual(['bar']);
  });

  it('hides the track picker with nothing to choose between', () => {
    expect(trackPickerVisible(testEditingStore().getState())).toBe(false);
    expect(
      trackPickerVisible(testEditingStore(twinkleScore()).getState())
    ).toBe(false);
    expect(
      trackPickerVisible(testEditingStore(twoTrackScore()).getState())
    ).toBe(true);
  });
});
