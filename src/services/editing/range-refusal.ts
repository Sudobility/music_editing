/**
 * A note the instrument cannot play is refused, whichever way a person tries
 * to write it.
 *
 * Import may bring such notes in — a sub-octave bass layer from a MIDI file is
 * ordinary, and the notation marks them rather than rewriting them — but no
 * editing route may make more of them. Entry, a pitch change and a pitch drag
 * always refused; transposing, moving notes onto another part and pasting did
 * not, which made the rule a matter of which button was pressed. They all come
 * through here now, so the answer and the wording are the same everywhere.
 */
import type {
  OutOfRangeCopy,
  Pitch,
  PitchChange,
  RefusedEdit,
  Score,
  ToastAction,
  Track,
  UUID,
} from '@sudobility/music_types';
import {
  findEvent,
  findTrack,
  isNoteEvent,
  midiIsInRange,
  midiToPitch,
  pitchToMidi,
  pitchToString,
  trackKeyboardRange,
  trackRangeIsBinding,
} from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import { editingCopy } from './copy.js';

/** All a refusal needs: somewhere to say so. A slice passes `{ getState: get }`. */
type EditorStoreApi<T extends EditingState = EditingState> = Pick<
  EditingStoreApi<T>,
  'getState'
>;

/**
 * Why `sounding` is a note `track` cannot play, or null if it can.
 *
 * The sibling of the polyphony refusal in `insertChordAtCaret`, and the same
 * contract: a note the instrument has no key, string or drum for is *refused*,
 * never quietly moved. Folding it into the compass (`foldMidiIntoRange`) is
 * right for material nobody typed — a generator's output, an import — but a
 * person who typed C5 and got C3 back would read it as a bug in the editor.
 *
 * **Sounding pitch, always.** Every compass in the catalogue is a sounding
 * number, so a caller holding a written pitch inverts its lens first
 * (`soundingPitchForTrack`) — the same direction `setNotePitch` already stores
 * in. Comparing a written pitch here is invisible on a piano and wrong by a
 * tone on a B-flat trumpet, which is exactly the case nobody tests by hand.
 *
 * Only against a compass the catalogue actually measured. A row marked
 * `assumed`, `tunable` or `synthetic` is a plausible span rather than a fact,
 * and refusing music against a guess is worse than letting an odd note
 * through; `trackRangeIsBinding` is that distinction. Percussion is binding —
 * a kit has the pieces it has.
 *
 * Returns the facts, not a sentence. It returned an English clause, which each
 * call site finished with an English tail; the words now belong to the host
 * (`EditingCopy.outOfRange`), and the one thing only a call site knows — what
 * it was about to do — travels as `refused`.
 */
export function outOfRangeReason(
  track: Track | null | undefined,
  sounding: Pitch
): Omit<OutOfRangeCopy, 'refused'> | null {
  if (!track || !trackRangeIsBinding(track)) return null;
  const range = trackKeyboardRange(track);
  const midi = pitchToMidi(sounding);
  if (midiIsInRange(midi, range)) return null;
  return {
    pitch: pitchToString(sounding),
    instrument: track.instrumentName,
    low: pitchToString(midiToPitch(range.min)),
    high: pitchToString(midiToPitch(range.max)),
    direction: midi > range.max ? 'above' : 'below',
  };
}

/**
 * The toast every range refusal raises.
 *
 * `action` is for the one refusal that can strand music — a paste after a cut
 * — and is otherwise absent.
 */
function pushRangeRefusal<T extends EditingState>(
  store: EditorStoreApi<T>,
  reason: Omit<OutOfRangeCopy, 'refused'>,
  refused: RefusedEdit,
  action?: ToastAction
): void {
  const state = store.getState();
  const id = state.pushToast({
    severity: 'warning',
    message: editingCopy().outOfRange({ ...reason, refused }),
    ...(action
      ? {
          action: {
            label: action.label,
            onClick: () => {
              action.onClick();
              store.getState().dismissToast(id);
            },
          },
        }
      : {}),
  });
}

/**
 * The first of `pitches` the track cannot play, refused with a toast.
 *
 * The whole chord goes or none of it does, as with polyphony: writing the
 * playable half of a triad is a third answer nobody asked for.
 */
export function refuseOutOfRange<T extends EditingState>(
  store: EditorStoreApi<T>,
  track: Track | null | undefined,
  pitches: readonly Pitch[],
  refused: RefusedEdit,
  action?: ToastAction
): boolean {
  for (const pitch of pitches) {
    const reason = outOfRangeReason(track, pitch);
    if (reason) {
      pushRangeRefusal(store, reason, refused, action);
      return true;
    }
  }
  return false;
}

/** How far `midi` lies outside `range`, in semitones; 0 inside. */
function distanceOutside(
  midi: number,
  range: { min: number; max: number }
): number {
  if (midi < range.min) return range.min - midi;
  if (midi > range.max) return midi - range.max;
  return 0;
}

/**
 * Refuses changes that would leave a note further outside its instrument than
 * it already is.
 *
 * The rule for every edit of a note that exists — transposing, an accidental,
 * the inspector's pitch field, a pitch drag. Not "any note ends out of range":
 * an imported note below the compass has to be movable *toward* it, a semitone
 * or a step at a time if the reader likes, or the only way to fix one is to
 * delete it. What is refused is making things worse: taking a playable note
 * out, or an unplayable one further away. A note that does not exist yet has
 * nothing to move from, so entry keeps the strict `refuseOutOfRange`.
 */
export function refuseOutOfRangeChanges<T extends EditingState>(
  store: EditorStoreApi<T>,
  score: Score,
  changes: readonly PitchChange[],
  refused: RefusedEdit
): boolean {
  for (const { id, to } of changes) {
    const event = findEvent(score, id);
    if (!event || !isNoteEvent(event)) continue;
    const track = findTrack(score, event.trackId);
    if (!track || !trackRangeIsBinding(track)) continue;
    const range = trackKeyboardRange(track);
    const after = pitchToMidi(to);
    if (midiIsInRange(after, range)) continue;
    const before = pitchToMidi(event.pitch);
    if (distanceOutside(after, range) < distanceOutside(before, range))
      continue;
    const reason = outOfRangeReason(track, to);
    if (reason) {
      pushRangeRefusal(store, reason, refused);
      return true;
    }
  }
  return false;
}

/** `refuseOutOfRangeChanges` for moving the notes `ids` by `semitones`. */
export function refuseOutOfRangeTranspose<T extends EditingState>(
  store: EditorStoreApi<T>,
  score: Score,
  ids: readonly UUID[],
  semitones: number,
  refused: RefusedEdit
): boolean {
  const changes: PitchChange[] = [];
  for (const id of ids) {
    const event = findEvent(score, id);
    if (!event || !isNoteEvent(event)) continue;
    changes.push({
      id,
      to: midiToPitch(pitchToMidi(event.pitch) + semitones),
    });
  }
  return refuseOutOfRangeChanges(store, score, changes, refused);
}

/**
 * Refuses notes arriving on `track` from elsewhere — moved or pasted — that it
 * cannot play. Their pitches were fine where they were; on this instrument
 * they would be new notes a person wrote.
 */
export function refuseOutOfRangeArrival<T extends EditingState>(
  store: EditorStoreApi<T>,
  track: Track | null | undefined,
  pitches: readonly Pitch[],
  refused: RefusedEdit,
  action?: ToastAction
): boolean {
  return refuseOutOfRange(store, track, pitches, refused, action);
}
