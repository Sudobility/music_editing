/**
 * The editor's key bindings, as a table rather than as a DOM listener.
 *
 * What a key *means* is a property of the editor, not of the browser: a
 * desktop build should transpose with the same arrows and write notes with the
 * same letters, and the surest way to make two apps agree is to give them one
 * table rather than two listeners to keep in step.
 *
 * So this owns the bindings and the actions, and the host owns the platform:
 * attaching a listener, deciding what counts as a focused text field, and
 * calling `preventDefault` when the answer comes back `true`. The chord it
 * takes is deliberately not a DOM event — `key` uses the same names
 * `KeyboardEvent.key` does because they are the widely-understood ones, but
 * anything that can produce those strings can drive this.
 */
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import {
  caretToBarEdge,
  caretToScoreEdge,
  chooseDuration,
  deleteSelected,
  insertNoteAtCaret,
  insertRestAtSelection,
  moveSelectionHorizontal,
  selectAll,
  stepCaret,
  toggleArpeggiate,
  toggleFermata,
  toggleGlissando,
  toggleHairpin,
  toggleOttava,
  toggleSlur,
  toggleTie,
  transposeOctave,
  transposeSemitone,
} from './editing.js';
import {
  durationForDigit,
  isPitchLetter,
  pitchForLetter,
} from '../../domain/notation/note-entry.js';
import { withModifier } from '@sudobility/music_types';
import { selectToolbarAvailability } from './toolbar.js';
import type { EditorKeyChord, ToolbarControl } from '@sudobility/music_types';

/**
 * What the host lends the table.
 *
 * `togglePlay` because playback is a real-time device rather than a score
 * edit; the clipboard prompts because cutting and pasting can each have two
 * outcomes and the shortcut must offer the same choice the toolbar does.
 * Both optional: a host without dialogs still gets working shortcuts, falling
 * back to the store actions' own defaults.
 */
export type EditorShortcutHost = {
  togglePlay?: () => void;
  requestCut?: () => void;
  requestPaste?: () => void;
};

/**
 * Marks on Shift — the one modifier left, since letters are note entry and
 * digits are note values. Each names the toolbar control it stands in for, so
 * a key is available exactly when its button is.
 */
const SHIFT_MARKS: Record<
  string,
  { control: ToolbarControl; run: (store: EditingStoreApi) => void }
> = {
  F: { control: 'fermata', run: store => toggleFermata(store) },
  A: { control: 'arpeggiate', run: store => toggleArpeggiate(store) },
  G: { control: 'glissando', run: store => toggleGlissando(store) },
  // No button of its own; an octave bracket is a span, so it takes the slur's
  // rule of two notes.
  O: { control: 'slur', run: store => toggleOttava(store, '8va') },
  '<': {
    control: 'crescendo',
    run: store => toggleHairpin(store, 'crescendo'),
  },
  '>': {
    control: 'diminuendo',
    run: store => toggleHairpin(store, 'diminuendo'),
  },
};

/**
 * The keys bound to a mark, for anything that has to LIST the shortcuts.
 *
 * Exported because the app's own shortcut help was a hand-typed copy of this
 * map and had fallen six entries behind it: fermata, arpeggiate, glissando,
 * the octave bracket and both hairpins were all bound and none of them was
 * shown. A reader had no way to discover them. Publishing the keys lets the
 * help and the documentation be checked against the bindings instead of
 * retyping them.
 */
export const SHIFT_MARK_KEYS: readonly string[] = Object.keys(SHIFT_MARKS);

/**
 * Perform whatever `chord` is bound to, and say whether anything was.
 *
 * `false` means the key belongs to the host — nothing was edited and nothing
 * should be swallowed. Every `true` is an edit, so the caller should stop the
 * platform's own handling of it.
 *
 * The order below is load-bearing in one place: the Shift marks are resolved
 * *above* note entry, because `Shift+G` arrives as `"G"` and `pitchForLetter`
 * would otherwise happily write it as a note.
 */
export function runEditorShortcut<T extends EditingState>(
  store: EditingStoreApi<T>,
  chord: EditorKeyChord,
  host: EditorShortcutHost = {}
): boolean {
  const state = store.getState();
  /*
    A key stands in for a toolbar control, so it is available exactly when that
    control is. An unavailable key is still *claimed* — returned `true` — so a
    letter pressed during playback does not fall through to the page and type
    into whatever the browser focuses next; it simply does nothing.
  */
  const available = selectToolbarAvailability(state);
  const when = (control: ToolbarControl, run: () => void): true => {
    if (available[control]) run();
    return true;
  };

  if (chord.key === ' ') {
    host.togglePlay?.();
    return true;
  }

  if (chord.key === 'Escape') {
    state.clearSelection();
    return true;
  }

  if (chord.key === 'Delete') {
    deleteSelected(store);
    return true;
  }

  if (chord.mod) {
    const letter = chord.key.toLowerCase();
    if (letter === 'z') {
      if (chord.shift) state.redo();
      else state.undo();
      return true;
    }
    if (letter === 'c') {
      state.copySelection();
      return true;
    }
    if (letter === 'x') {
      // Through the prompt when there is one: cutting has two possible
      // outcomes and the shortcut must offer the same choice the toolbar does.
      if (host.requestCut) host.requestCut();
      else state.cutSelection();
      return true;
    }
    if (letter === 'v') {
      if (host.requestPaste) host.requestPaste();
      else state.paste();
      return true;
    }
    if (letter === 'a') {
      selectAll(store);
      return true;
    }
  }

  /*
    Caret navigation, on Alt.

    Alt rather than a bare arrow: the arrows already move the selection and
    transpose it, and note entry needs the caret moved without disturbing
    either. Stepping by the current note value is the grid the writer is
    already thinking in.
  */
  if (chord.alt && (chord.key === 'ArrowLeft' || chord.key === 'ArrowRight')) {
    stepCaret(store, chord.key === 'ArrowLeft' ? 'prev' : 'next');
    return true;
  }

  if (chord.key === 'Home' || chord.key === 'End') {
    const edge = chord.key === 'Home' ? 'start' : 'end';
    if (chord.mod) caretToScoreEdge(store, edge);
    else caretToBarEdge(store, edge);
    return true;
  }

  if (chord.shift && !chord.mod && !chord.alt) {
    const mark = SHIFT_MARKS[chord.key];
    if (mark) return when(mark.control, () => mark.run(store));
  }

  // Everything below is note entry, and none of it takes a modifier — so a
  // shortcut belonging to the host passing through is never mistaken for a note.
  if (chord.mod || chord.alt) return false;

  // A digit is the note-value button: it arms the next note *and* retimes the
  // selection, which is what `chooseDuration` means. Arming alone made the key
  // and the button two different controls.
  const digitDuration = durationForDigit(chord.key, state.snapGrid);
  if (digitDuration)
    return when('noteDuration', () => chooseDuration(store, digitDuration));

  // Letters write that pitch at the caret, in the octave nearest the note
  // before it, and step the caret past what was written.
  if (isPitchLetter(chord.key))
    return when('insertNote', () =>
      insertNoteAtCaret(store, pitchForLetter(store, chord.key), {
        advanceCaret: true,
      })
    );

  const letter = chord.key.toLowerCase();
  if (letter === 'n')
    return when('noteInput', () => state.setNoteInput(!state.noteInput));
  if (chord.key === '.')
    return when('dotted', () =>
      chooseDuration(store, withModifier(state.snapGrid, 'dotted'))
    );
  if (letter === 'r')
    return when('insertRest', () => insertRestAtSelection(store));
  if (letter === 's') return when('slur', () => toggleSlur(store));
  if (letter === 't') return when('tie', () => toggleTie(store, 'tieStart'));

  if (chord.key === 'ArrowUp') {
    if (chord.shift) transposeOctave(store, 1);
    else transposeSemitone(store, 1);
    return true;
  }
  if (chord.key === 'ArrowDown') {
    if (chord.shift) transposeOctave(store, -1);
    else transposeSemitone(store, -1);
    return true;
  }
  if (chord.key === 'ArrowLeft') {
    moveSelectionHorizontal(store, 'prev');
    return true;
  }
  if (chord.key === 'ArrowRight') {
    moveSelectionHorizontal(store, 'next');
    return true;
  }

  return false;
}
