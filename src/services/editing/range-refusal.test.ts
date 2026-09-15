/**
 * A person cannot write a note the instrument has no key for — by any route.
 *
 * Import can bring such notes in (and the notation marks them); these are the
 * editing routes that used to let a person make more of them: transposing,
 * moving notes onto another part, and pasting.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allNotes,
  emptySelection,
  changePitchCommand,
  midiToPitch,
  pitchToMidi,
} from '@sudobility/music_types';
import type { NoteEvent, Score } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import { editingCopy, setEditingCopy } from './copy.js';
import {
  changeAccidental,
  commitPitchDrag,
  relocateNotes,
  setNotePitch,
  transposeOctave,
  transposeSemitone,
} from './editing.js';

/** Violin: a measured compass starting at G3 (MIDI 55). */
const VIOLIN = 40;

function violinTwinkle(): Score {
  const score = twinkleScore();
  return {
    ...score,
    tracks: score.tracks.map(track => ({ ...track, midiProgram: VIOLIN })),
  };
}

function midis(score: Score | null): number[] {
  return allNotes(score!)
    .filter((n): n is NoteEvent & { pitch: NonNullable<NoteEvent['pitch']> } =>
      Boolean((n as NoteEvent).pitch)
    )
    .map(n => pitchToMidi(n.pitch));
}

function warnings(store: ReturnType<typeof testEditingStore>): string[] {
  return store
    .getState()
    .toasts.filter(t => t.severity === 'warning')
    .map(t => t.message);
}

function selectEverything(target: ReturnType<typeof testEditingStore>) {
  target.getState().setSelection({
    ...emptySelection(),
    eventIds: allNotes(target.getState().score!).map(n => n.id),
  });
}

let store: ReturnType<typeof testEditingStore>;
const hostCopy = editingCopy();
beforeEach(() => {
  // The words are the host's; these tests only need a refusal to be visible.
  setEditingCopy({
    ...hostCopy,
    outOfRange: ({ pitch, direction }) => `${pitch} ${direction} range`,
  });
});
afterEach(() => {
  store = undefined as never;
  setEditingCopy(hostCopy);
});

describe('transposing', () => {
  it('refuses a transpose that takes a note below the instrument', () => {
    store = testEditingStore(violinTwinkle());
    const before = midis(store.getState().score);
    selectEverything(store);
    transposeOctave(store, -1);
    expect(midis(store.getState().score)).toEqual(before);
    expect(warnings(store).join()).toMatch(/range/);
  });

  it('still transposes inside the range', () => {
    store = testEditingStore(violinTwinkle());
    const before = midis(store.getState().score);
    selectEverything(store);
    transposeSemitone(store, -1);
    expect(midis(store.getState().score)).toEqual(before.map(m => m - 1));
  });

  it('lets an imported low note be brought back toward the range', () => {
    store = testEditingStore(violinTwinkle());
    const first = allNotes(store.getState().score!)[0] as NoteEvent;
    // As an import would have it: below the violin's G3.
    store
      .getState()
      .dispatchCommand(
        changePitchCommand([first.id], midiToPitch(40), 'import')
      );
    store
      .getState()
      .setSelection({ ...emptySelection(), eventIds: [first.id] });

    transposeSemitone(store, 1);
    const moved = allNotes(store.getState().score!).find(
      n => n.id === first.id
    ) as NoteEvent;
    expect(pitchToMidi(moved.pitch)).toBe(41);
    expect(warnings(store)).toEqual([]);
  });

  it('refuses moving an imported low note further away', () => {
    store = testEditingStore(violinTwinkle());
    const first = allNotes(store.getState().score!)[0] as NoteEvent;
    store
      .getState()
      .dispatchCommand(
        changePitchCommand([first.id], midiToPitch(40), 'import')
      );
    store
      .getState()
      .setSelection({ ...emptySelection(), eventIds: [first.id] });

    transposeSemitone(store, -1);
    const kept = allNotes(store.getState().score!).find(
      n => n.id === first.id
    ) as NoteEvent;
    expect(pitchToMidi(kept.pitch)).toBe(40);
    expect(warnings(store).length).toBe(1);
  });
});

describe('moving notes onto another part', () => {
  it('refuses notes the destination instrument cannot play', () => {
    const score = twinkleScore();
    const piano = score.tracks[0]!;
    // A second part, a violin, and the piano's notes an octave down on the piano.
    const low: Score = {
      ...score,
      tracks: [
        piano,
        {
          ...piano,
          id: 'violin',
          name: 'Violin',
          midiProgram: VIOLIN,
          measures: piano.measures.map(m => ({
            ...m,
            id: `v-${m.id}`,
            voices: m.voices.map(v => ({ ...v, events: [] })),
          })),
        },
      ],
    };
    store = testEditingStore(low);
    const pianoNotes = allNotes(store.getState().score!).filter(
      n => n.trackId === piano.id
    ) as NoteEvent[];
    for (const note of pianoNotes) {
      store
        .getState()
        .dispatchCommand(
          changePitchCommand(
            [note.id],
            midiToPitch(pitchToMidi(note.pitch) - 12),
            'setup'
          )
        );
    }
    const before = JSON.stringify(store.getState().score);
    relocateNotes(
      store,
      pianoNotes.slice(0, 2).map(n => n.id),
      { targetTrackId: 'violin', deltaTicks: 0, collision: 'replace' }
    );
    expect(JSON.stringify(store.getState().score)).toBe(before);
    expect(warnings(store).join()).toMatch(/range/);
  });
});

describe('pasting', () => {
  it('refuses pasting notes the destination instrument cannot play', () => {
    const score = twinkleScore();
    const piano = score.tracks[0]!;
    const withViolin: Score = {
      ...score,
      tracks: [
        piano,
        {
          ...piano,
          id: 'violin',
          name: 'Violin',
          midiProgram: VIOLIN,
          measures: piano.measures.map(m => ({
            ...m,
            id: `v-${m.id}`,
            voices: m.voices.map(v => ({ ...v, events: [] })),
          })),
        },
      ],
    };
    store = testEditingStore(withViolin);
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
    const before = JSON.stringify(store.getState().score);
    store.getState().paste(0);
    expect(JSON.stringify(store.getState().score)).toBe(before);
    expect(warnings(store).join()).toMatch(/range/);
  });
});

/** A violin twinkle whose first note has been set to `midi`, as an import would leave it. */
function withFirstNoteAt(midi: number) {
  const target = testEditingStore(violinTwinkle());
  const first = allNotes(target.getState().score!)[0] as NoteEvent;
  target
    .getState()
    .dispatchCommand(
      changePitchCommand([first.id], midiToPitch(midi), 'import')
    );
  target.getState().setSelection({ ...emptySelection(), eventIds: [first.id] });
  const midiNow = () =>
    pitchToMidi(
      (
        allNotes(target.getState().score!).find(
          n => n.id === first.id
        ) as NoteEvent
      ).pitch
    );
  return { target, id: first.id, midiNow };
}

describe('changing an accidental', () => {
  it('refuses flattening the lowest playable note out of the range', () => {
    // G3 is the violin's lowest note; G-flat 3 is below it.
    const { target, midiNow } = withFirstNoteAt(55);
    store = target;
    changeAccidental(store, -1);
    expect(midiNow()).toBe(55);
    expect(warnings(store).join()).toMatch(/range/);
  });

  it('lets an out-of-range note be sharpened toward the range', () => {
    const { target, midiNow } = withFirstNoteAt(52); // E3, a third too low
    store = target;
    changeAccidental(store, 1);
    expect(midiNow()).toBe(53);
    expect(warnings(store)).toEqual([]);
  });
});

describe('the inspector and pitch drag follow the same rule as transposing', () => {
  it('lets the inspector move an imported note toward the range', () => {
    const { target, id, midiNow } = withFirstNoteAt(40);
    store = target;
    setNotePitch(store, id, midiToPitch(41), 'concert');
    expect(midiNow()).toBe(41);
  });

  it('refuses the inspector moving an imported note further away', () => {
    const { target, id, midiNow } = withFirstNoteAt(40);
    store = target;
    setNotePitch(store, id, midiToPitch(39), 'concert');
    expect(midiNow()).toBe(40);
    expect(warnings(store).length).toBe(1);
  });

  it('lets a drag move an imported note toward the range', () => {
    const { target, id, midiNow } = withFirstNoteAt(40); // E2
    store = target;
    commitPitchDrag(store, id, midiToPitch(40), 1); // up a step: F2
    expect(midiNow()).toBe(41);
  });

  it('still refuses taking a playable note out by drag', () => {
    const { target, id, midiNow } = withFirstNoteAt(55); // G3
    store = target;
    commitPitchDrag(store, id, midiToPitch(55), -1); // F3
    expect(midiNow()).toBe(55);
    expect(warnings(store).length).toBe(1);
  });
});

describe('pasting within the part the notes came from', () => {
  it('allows it: a cut and paste along one part must not lose the notes', () => {
    const { target, midiNow } = withFirstNoteAt(40);
    store = target;
    store.getState().copySelection();
    const count = allNotes(store.getState().score!).length;
    store.getState().paste(1920);
    expect(warnings(store)).toEqual([]);
    expect(midiNow()).toBe(40);
    expect(
      allNotes(store.getState().score!).filter(
        n => pitchToMidi((n as NoteEvent).pitch) === 40
      ).length
    ).toBeGreaterThan(1);
    expect(allNotes(store.getState().score!).length).toBeGreaterThanOrEqual(
      count
    );
  });
});
