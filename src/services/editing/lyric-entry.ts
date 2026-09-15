/**
 * Typing words under a melody, as rules rather than as an input field.
 *
 * A line of lyrics is one syllable per note, in order, and the only usable way
 * to enter one is to type through it the way it is sung: **space** (or Tab)
 * ends a word and moves on, **hyphen** ends a syllable within a word and moves
 * on, **Enter** commits and stops, **Escape** abandons the syllable in
 * progress, and **back** (Shift+Space on a keyboard, a button on a phone) steps
 * over a typo without starting the line again.
 *
 * Both apps had written those rules inside their entry bar, and they differed
 * in the one place that is invisible until it bites: the web bar read
 * `keydown`, so a hyphen typed with the caret *inside* a word broke the
 * syllable there, while the native bar watched the text and honoured a
 * separator only at the end — so the same keystroke did two things depending
 * on which app it was typed into. The web behaviour is the rule now, and a
 * host that can only watch text gets it through `splitLyricSeparator`.
 *
 * The step is pure: it says what to write and where to go, and `applyLyricStep`
 * is the one line that touches the store. That is what lets the rules be tested
 * without a field, a renderer or a keyboard.
 */
import type { NoteEvent } from '@sudobility/music_types';
import {
  getMusicPosition,
  noteIndexAtOrAfter,
  trackNotesInOrder,
} from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import { selectActiveTrackId } from '../../store/selectors.js';
import { writeLyric } from './editing.js';

/** Where entry is in the line. */
export type LyricEntryState = {
  /** The note being written, into the notes entry began with. */
  index: number;
  /** How many notes the line has. */
  count: number;
  /** Whether the syllable before this one ended in a hyphen. */
  continuing: boolean;
};

/** A keystroke, or its on-screen equivalent, that means something to entry. */
export type LyricInput =
  'space' | 'tab' | 'hyphen' | 'enter' | 'escape' | 'back';

export type LyricWrite = {
  index: number;
  text: string;
  continuing: boolean;
  hyphenated: boolean;
};

export type LyricStep = {
  state: LyricEntryState;
  /** What to write, or null when the input writes nothing. */
  write: LyricWrite | null;
  /** Whether entry is over. */
  close: boolean;
};

/**
 * Begin entry on the active track, at the first note at or after the caret.
 *
 * `notes` is a snapshot of the line in tick order; the syllable already on a
 * note is read live through `lyricTextAt`, because every syllable typed since
 * entry began has gone into the score without changing this array. `null`
 * with nothing to write under — no score, no notes on the track — and while
 * the transport plays, when the store would refuse every syllable.
 */
export function beginLyricEntry<T extends EditingState>(
  store: EditingStoreApi<T>
): { notes: NoteEvent[]; startIndex: number; state: LyricEntryState } | null {
  const state = store.getState();
  if (!state.score || state.state === 'playing') return null;
  const trackId = selectActiveTrackId(state);
  if (!trackId) return null;
  const notes = trackNotesInOrder(state.score, trackId);
  if (notes.length === 0) return null;
  const startIndex = noteIndexAtOrAfter(notes, getMusicPosition().reportedTick);
  return {
    notes,
    startIndex,
    state: { index: startIndex, count: notes.length, continuing: false },
  };
}

/**
 * What an input does, given the syllable typed so far.
 *
 * The draft is trimmed before it is written: a space typed before a syllable
 * is not part of it, and `writeLyric` treats an empty result as "clear".
 */
export function lyricEntryStep(
  state: LyricEntryState,
  input: LyricInput,
  draft: string
): LyricStep {
  const text = draft.trim();
  const write = (hyphenated: boolean, continuing = state.continuing) => ({
    index: state.index,
    text,
    continuing,
    hyphenated,
  });

  if (input === 'escape') return { state, write: null, close: true };

  if (input === 'enter')
    return {
      state: { ...state, continuing: false },
      write: write(false),
      close: true,
    };

  if (input === 'back') {
    // The syllable keeps the join it already had: stepping back is not a
    // statement about where the word ends.
    return {
      state: { ...state, index: Math.max(0, state.index - 1) },
      write: write(state.continuing),
      close: false,
    };
  }

  const hyphenated = input === 'hyphen';
  const last = state.index + 1 >= state.count;
  return {
    state: {
      ...state,
      index: last ? state.index : state.index + 1,
      continuing: hyphenated,
    },
    write: write(hyphenated),
    close: last,
  };
}

/**
 * A separator in text a host could only watch, rather than intercept.
 *
 * A software keyboard has no key event to cancel — a typed space is already a
 * character in the field — so a host watching the text asks this after each
 * change. A hyphen, space or tab **anywhere** is a separator, as the key is on
 * a hardware keyboard, and the syllable is what was typed without it. One
 * separator per change is what a keystroke produces; the first found wins.
 */
export function splitLyricSeparator(text: string): {
  syllable: string;
  separator: 'space' | 'tab' | 'hyphen' | null;
} {
  const found = /[-\t ]/.exec(text);
  if (!found) return { syllable: text.trim(), separator: null };
  const syllable = (
    text.slice(0, found.index) + text.slice(found.index + 1)
  ).trim();
  const separator =
    found[0] === '-' ? 'hyphen' : found[0] === '\t' ? 'tab' : 'space';
  return { syllable, separator };
}

/** Write what a step says to write. The one part of entry that touches the store. */
export function applyLyricStep<T extends EditingState>(
  store: EditingStoreApi<T>,
  notes: readonly NoteEvent[],
  step: LyricStep
): void {
  if (!step.write) return;
  const note = notes[step.write.index];
  if (!note) return;
  writeLyric(store, {
    noteId: note.id,
    text: step.write.text,
    continuing: step.write.continuing,
    hyphenated: step.write.hyphenated,
  });
}
