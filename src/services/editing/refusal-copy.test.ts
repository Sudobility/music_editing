/**
 * A refusal says what happened in the host's language, not in this library's.
 *
 * The range and polyphony refusals were English sentences built here — the
 * pitch, the instrument, "above"/"below" and "so it was not added" all spliced
 * into one string — so a Chinese reader was told in English why the note they
 * played did not appear. The library now hands the host the *facts* and the
 * host writes the sentence, the way `validationProblem` already worked.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allNotes,
  changePitchCommand,
  emptySelection,
  getMusicPositionSource,
  midiToPitch,
  pitchToMidi,
  pitchToString,
  trackKeyboardRange,
} from '@sudobility/music_types';
import type { NoteEvent, Score } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import type { EditingCopy, OutOfRangeCopy, PolyphonyCopy } from './copy.js';
import { editingCopy, setEditingCopy } from './copy.js';
import {
  changeAccidental,
  commitPitchDrag,
  insertChordAtCaret,
  insertNoteAtCaret,
  relocateNotes,
  setNotePitch,
  transposeOctave,
} from './editing.js';

/** Violin: a measured compass starting at G3, two notes at once. */
const VIOLIN = 40;

function violinTwinkle(): Score {
  const score = twinkleScore();
  return {
    ...score,
    tracks: score.tracks.map(track => ({ ...track, midiProgram: VIOLIN })),
  };
}

/** A second, empty violin part beside twinkle's piano. */
function pianoAndViolin(): Score {
  const score = twinkleScore();
  const piano = score.tracks[0]!;
  return {
    ...score,
    tracks: [
      piano,
      {
        ...piano,
        id: 'violin',
        name: 'Violin',
        instrumentName: 'Violin',
        midiProgram: VIOLIN,
        measures: piano.measures.map(m => ({
          ...m,
          id: `v-${m.id}`,
          voices: m.voices.map(v => ({ ...v, events: [] })),
        })),
      },
    ],
  };
}

let ranges: OutOfRangeCopy[];
let chords: PolyphonyCopy[];
let original: EditingCopy;

beforeEach(() => {
  ranges = [];
  chords = [];
  original = editingCopy();
  setEditingCopy({
    ...original,
    outOfRange: detail => {
      ranges.push(detail);
      return `range:${detail.refused}`;
    },
    tooManyNotes: detail => {
      chords.push(detail);
      return `chord:${detail.limit}`;
    },
    undoAction: () => 'UNDO',
  });
  getMusicPositionSource().moveTo(0);
});

afterEach(() => {
  setEditingCopy(original);
});

function warnings(store: ReturnType<typeof testEditingStore>) {
  return store.getState().toasts.filter(t => t.severity === 'warning');
}

describe('an out-of-range refusal hands the host its facts', () => {
  it('names the pitch, the instrument, its compass, the side and the action', () => {
    const store = testEditingStore(violinTwinkle());
    const track = store.getState().score!.tracks[0]!;
    const range = trackKeyboardRange(track);
    const low = { step: 'C', accidental: 0, octave: 2 } as const;

    insertNoteAtCaret(store, low);

    expect(ranges).toEqual([
      {
        pitch: pitchToString(low),
        instrument: track.instrumentName,
        low: pitchToString(midiToPitch(range.min)),
        high: pitchToString(midiToPitch(range.max)),
        direction: 'below',
        refused: 'addNote',
      },
    ]);
    expect(warnings(store).map(t => t.message)).toEqual(['range:addNote']);
  });

  it('says above for a note over the compass', () => {
    const store = testEditingStore(violinTwinkle());
    insertNoteAtCaret(store, midiToPitch(120));
    expect(ranges[0]?.direction).toBe('above');
  });

  it('tells each route apart, because only the route knows what it was doing', () => {
    const store = testEditingStore(violinTwinkle());
    const first = allNotes(store.getState().score!)[0] as NoteEvent;
    const g3 = midiToPitch(55);
    store
      .getState()
      .dispatchCommand(changePitchCommand([first.id], g3, 'setup'));
    store
      .getState()
      .setSelection({ ...emptySelection(), eventIds: [first.id] });

    insertChordAtCaret(store, [midiToPitch(30)], { mode: 'stack' });
    transposeOctave(store, -1);
    changeAccidental(store, -1);
    setNotePitch(store, first.id, midiToPitch(50), 'concert');
    commitPitchDrag(store, first.id, g3, -1);

    expect(ranges.map(r => r.refused)).toEqual([
      'addChord',
      'transpose',
      'changeAccidental',
      'changeNote',
      'moveNote',
    ]);
  });

  it('reports moving notes onto a part that cannot play them', () => {
    const store = testEditingStore(pianoAndViolin());
    const note = allNotes(store.getState().score!)[0] as NoteEvent;
    store
      .getState()
      .dispatchCommand(changePitchCommand([note.id], midiToPitch(40), 'setup'));
    relocateNotes(store, [note.id], {
      targetTrackId: 'violin',
      deltaTicks: 0,
      collision: 'replace',
    });
    expect(ranges.map(r => r.refused)).toEqual(['moveNotes']);
    expect(ranges[0]?.instrument).toBe('Violin');
  });
});

describe('a polyphony refusal hands the host its facts', () => {
  it('names the instrument and how many notes it plays', () => {
    const store = testEditingStore(violinTwinkle());
    const track = store.getState().score!.tracks[0]!;
    // Twinkle already sounds a note at tick 0; two more make three on a violin.
    insertChordAtCaret(store, [midiToPitch(64), midiToPitch(67)], {
      mode: 'stack',
    });
    expect(chords).toEqual([
      { instrument: track.instrumentName, limit: 2, refused: 'addChord' },
    ]);
    expect(warnings(store).map(t => t.message)).toEqual(['chord:2']);
  });
});

describe('a paste refused after a cut', () => {
  /** Cut the piano's first note (moved low), then paste it onto the violin. */
  function cutThenPasteOntoViolin(options?: { closeGap?: boolean }) {
    const store = testEditingStore(pianoAndViolin());
    const first = allNotes(store.getState().score!)[0] as NoteEvent;
    store
      .getState()
      .dispatchCommand(
        changePitchCommand([first.id], midiToPitch(40), 'setup')
      );
    const beforeCut = store.getState().score;
    store
      .getState()
      .setSelection({ ...emptySelection(), eventIds: [first.id] });
    store.getState().cutSelection(options);
    store
      .getState()
      .setSelection({ ...emptySelection(), trackIds: ['violin'] });
    store.getState().paste(0);
    return { store, first, beforeCut };
  }

  it('offers Undo, labelled by the host, which puts the cut notes back', () => {
    const { store, first } = cutThenPasteOntoViolin();
    const [toast] = warnings(store);
    expect(toast?.message).toBe('range:paste');
    expect(toast?.action?.label).toBe('UNDO');

    toast!.action!.onClick();
    const restored = allNotes(store.getState().score!).find(
      n => n.id === first.id
    ) as NoteEvent | undefined;
    expect(restored && pitchToMidi(restored.pitch)).toBe(40);
    // The toast is spent once its action has been taken.
    expect(warnings(store)).toEqual([]);
  });

  it('undoes a cut that closed its gap in one step', () => {
    const { store, first } = cutThenPasteOntoViolin({ closeGap: true });
    warnings(store)[0]!.action!.onClick();
    expect(allNotes(store.getState().score!).some(n => n.id === first.id)).toBe(
      true
    );
  });

  it('offers nothing to undo after a copy, when nothing was removed', () => {
    const store = testEditingStore(pianoAndViolin());
    const first = allNotes(store.getState().score!)[0] as NoteEvent;
    store
      .getState()
      .dispatchCommand(
        changePitchCommand([first.id], midiToPitch(40), 'setup')
      );
    store
      .getState()
      .setSelection({ ...emptySelection(), eventIds: [first.id] });
    store.getState().copySelection();
    store
      .getState()
      .setSelection({ ...emptySelection(), trackIds: ['violin'] });
    store.getState().paste(0);
    const [toast] = warnings(store);
    expect(toast?.message).toBe('range:paste');
    expect(toast?.action).toBeUndefined();
  });

  it('offers nothing once another edit has come after the cut', () => {
    // Undo would then reverse that edit instead of the cut, which is a
    // different thing from what the button says.
    const store = testEditingStore(pianoAndViolin());
    const notes = allNotes(store.getState().score!) as NoteEvent[];
    const [first, second] = [notes[0]!, notes[1]!];
    store
      .getState()
      .dispatchCommand(
        changePitchCommand([first.id], midiToPitch(40), 'setup')
      );
    store
      .getState()
      .setSelection({ ...emptySelection(), eventIds: [first.id] });
    store.getState().cutSelection();
    store
      .getState()
      .dispatchCommand(
        changePitchCommand([second.id], midiToPitch(62), 'later')
      );
    store
      .getState()
      .setSelection({ ...emptySelection(), trackIds: ['violin'] });
    store.getState().paste(0);
    expect(warnings(store)[0]?.action).toBeUndefined();
  });

  it('marks the clipboard as having come from a cut', () => {
    const { store } = cutThenPasteOntoViolin();
    expect(store.getState().clipboard?.fromCut).toBe(true);
    store.getState().setSelection({
      ...emptySelection(),
      eventIds: [allNotes(store.getState().score!)[0]!.id],
    });
    store.getState().copySelection();
    expect(store.getState().clipboard?.fromCut).toBe(false);
  });
});
