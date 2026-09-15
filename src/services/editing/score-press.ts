/**
 * What a press on the score means.
 *
 * Both apps hit-test the canvas the same way — the track gutter, then the
 * bar-number band, then a note, then a stave — and both then had to decide
 * what that hit *does*: which modifier extends a bar span, which one runs from
 * the caret, when a stave press writes a note and when it aims the caret. The
 * web wrote that decision out inline in its click handler and the native app
 * wrote a second, shorter one into its tap callback, and the two had already
 * parted: a long press on a stave in the native app aimed the caret, which
 * cleared the selection the menu was about to act on.
 *
 * The geometry stays with the renderer; the meaning is here. The hit types are
 * **structural** on purpose — declared in this package rather than imported
 * from music_drawing, which this package may not depend on — and music_drawing's
 * `ScoreCanvasHit` is assignable to `ScoreHit` as it stands, so a host passes
 * the canvas's answer straight through.
 */
import type {
  NoteEvent,
  Pitch,
  PitchDisplay,
  UUID,
} from '@sudobility/music_types';
import {
  findEvent,
  isNoteEvent,
  soundingPitchForDrawn,
} from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import {
  placeCaret,
  selectMeasureRange,
  selectNotes,
  selectToTick,
  writeNoteAtPoint,
} from './editing.js';

/**
 * Whatever lies under a press, as the renderer reports it.
 *
 * `null` (passed where a hit is expected) means the press landed on nothing —
 * between systems, or on the gutter's empty band.
 *
 * A stave's `pitch` is the pitch **as drawn** at that point, after the display
 * lenses; `routeScorePress` inverts them itself, because a drawn pitch stored
 * raw writes a note an octave out inside an `8va` and a tone out on a B-flat
 * part — and it does so silently, since the note then draws where it was
 * pressed and only sounds wrong.
 */
export type ScoreHit =
  | { kind: 'trackGutter'; trackId: UUID }
  | { kind: 'measureNumber'; measureIndex: number }
  | {
      kind: 'note';
      /** Every event sharing the notehead's box: a chord is one target. */
      eventIds: readonly UUID[];
      trackId: UUID;
      tick: number;
    }
  | { kind: 'stave'; trackId: UUID; tick: number; pitch: Pitch | null };

export type ScorePressModifiers = {
  shift: boolean;
  /** Cmd on macOS, Ctrl elsewhere — resolved by the host. */
  mod: boolean;
  /** The store's `noteInput`, passed so a host can route a press it has already read. */
  noteInput: boolean;
  /** How the pressed pitch was drawn, so it can be taken back to sounding pitch. */
  pitchDisplay: PitchDisplay;
  /** The bar a shift-extended bar selection grows from; see `selectMeasureRange`. */
  anchor: number | null;
};

/**
 * Perform an ordinary press (a click, a tap) and answer the next bar anchor.
 *
 * The web's order and modifiers, which are the reference:
 *
 * - **Track gutter** — make the track active and select it. Not a position in
 *   time, so the caret stays.
 * - **Bar number** — select that bar on the active track; Shift extends from
 *   the anchor; Mod+Shift is the same bar on *every* track, a different
 *   question from extending. Never moves the caret.
 * - **Mod** anywhere else — select from the caret to the pressed tick, without
 *   moving the caret, so one anchor can be extended again and again; Shift
 *   widens it to every track.
 * - **Note** — Shift toggles one note (the last id of the box, the one a
 *   single-id hit test always answered with) without touching the caret;
 *   otherwise the whole chord is selected and the caret aimed at it.
 * - **Stave** — with note input on and a pitch under the press, write the note
 *   there; otherwise place the caret, activate the track and clear the
 *   selection.
 *
 * The anchor only changes on a bar-number press. It is held by the caller —
 * in a ref, since it must never cause a render — and the rule for using it is
 * here.
 */
export function routeScorePress<T extends EditingState>(
  store: EditingStoreApi<T>,
  hit: ScoreHit | null,
  modifiers: ScorePressModifiers
): number | null {
  const state = store.getState();
  const { shift, mod, anchor } = modifiers;
  if (!state.score || !hit) return anchor;

  if (hit.kind === 'trackGutter') {
    state.setActiveTrack(hit.trackId);
    state.selectTrack(hit.trackId);
    return anchor;
  }

  if (hit.kind === 'measureNumber') {
    return selectMeasureRange(store, {
      index: hit.measureIndex,
      anchor,
      extend: shift && !mod,
      allTracks: mod && shift,
    });
  }

  if (mod) {
    selectToTick(store, { tick: hit.tick, allTracks: shift });
    return anchor;
  }

  if (hit.kind === 'note') {
    if (shift) {
      const last = hit.eventIds[hit.eventIds.length - 1];
      if (last) state.toggleEvent(last);
      return anchor;
    }
    selectNotes(store, hit.eventIds);
    return anchor;
  }

  if (modifiers.noteInput && hit.pitch) {
    writeNoteAtPoint(store, {
      tick: hit.tick,
      trackId: hit.trackId,
      pitch: soundingPitchForDrawn(
        state.score,
        hit.trackId,
        hit.tick,
        hit.pitch,
        modifiers.pitchDisplay
      ),
    });
    return anchor;
  }

  placeCaret(store, { tick: hit.tick, trackId: hit.trackId });
  return anchor;
}

/**
 * Select what a context press (right-click, long press) landed on, before the
 * menu opens — and answer the next bar anchor.
 *
 * The same hit order as an ordinary press, because a menu that opens over one
 * thing and acts on another is the one failure this shape must not have.
 *
 * **A press inside the existing selection keeps it.** Right-clicking one of
 * four selected bars means "these four"; narrowing to the pressed one is the
 * classic way a context menu throws away the selection somebody just built.
 * "Inside" is by bar *index* for bars, since a bar is the same bar on every
 * stave, and by any shared id for a chord.
 *
 * A bare stave selects nothing and moves nothing: the menu then acts on the
 * selection already there. Aiming the caret first — what the native long press
 * did — clears that selection, so the menu opened over nothing.
 */
export function selectForContextMenu<T extends EditingState>(
  store: EditingStoreApi<T>,
  hit: ScoreHit | null,
  anchor: number | null
): number | null {
  const state = store.getState();
  const score = state.score;
  if (!score || !hit) return anchor;
  const { selection } = state;

  if (hit.kind === 'trackGutter') {
    if (!selection.trackIds.includes(hit.trackId)) {
      state.setActiveTrack(hit.trackId);
      state.selectTrack(hit.trackId);
    }
    return anchor;
  }

  if (hit.kind === 'measureNumber') {
    const selected = new Set(selection.measureIds);
    const inside = score.tracks.some(track =>
      track.measures.some(
        m => m.index === hit.measureIndex && selected.has(m.id)
      )
    );
    if (inside) return anchor;
    return selectMeasureRange(store, {
      index: hit.measureIndex,
      anchor: null,
      extend: false,
      allTracks: false,
    });
  }

  if (hit.kind === 'note') {
    if (!hit.eventIds.some(id => selection.eventIds.includes(id)))
      selectNotes(store, hit.eventIds);
  }
  return anchor;
}

/**
 * What a primary press that may become a drag starts.
 *
 * - `move` — Alt on a note: drag the selection to another track or tick. The
 *   anchor is the last id of the box. `selectChord` is the chord to select
 *   first when none of it is selected yet (null to keep the selection); an
 *   explicit modifier leaves no ambiguity with a box select, so requiring a
 *   prior selection would be friction for nothing.
 * - `pitchDrag` — a press on the *one* selected note. Requiring it to be
 *   selected first is what keeps an ordinary press-and-drag across the staff a
 *   box select.
 * - `box` — everything else; Shift adds to the selection rather than replacing
 *   it. A box that never moves past the host's slop is an ordinary press, and
 *   goes to `routeScorePress` instead.
 */
export type PointerGesture =
  | {
      kind: 'move';
      anchorId: UUID;
      anchorTick: number;
      selectChord: readonly UUID[] | null;
    }
  | { kind: 'pitchDrag'; eventId: UUID; pitch: Pitch }
  | { kind: 'box'; additive: boolean };

/**
 * Decide what a press starts. Pure: reads the state, changes nothing — so a
 * host can classify on pointer-down and apply once the gesture is committed.
 *
 * Alt is checked **before** the pitch drag, because the same press on the same
 * selected note would otherwise start one; the modifier is the whole
 * disambiguation. Rests are never dragged — they have no pitch and nothing to
 * move.
 */
export function classifyPointerDown(
  state: Pick<EditingState, 'score' | 'selection'>,
  hit: ScoreHit | null,
  modifiers: { alt: boolean; shift: boolean }
): PointerGesture {
  const score = state.score;
  const noteHit = hit?.kind === 'note' ? hit : null;
  const box: PointerGesture = { kind: 'box', additive: modifiers.shift };
  if (!score || !noteHit) return box;
  const selected = state.selection.eventIds;

  if (modifiers.alt) {
    const anchorId = noteHit.eventIds[noteHit.eventIds.length - 1];
    const anchor = anchorId ? noteAt(score, anchorId) : null;
    if (anchor && anchorId) {
      return {
        kind: 'move',
        anchorId,
        anchorTick: anchor.startTick,
        selectChord: selected.includes(anchorId) ? null : noteHit.eventIds,
      };
    }
  }

  const only = selected.length === 1 ? selected[0] : undefined;
  if (only && noteHit.eventIds.includes(only)) {
    const note = noteAt(score, only);
    if (note) return { kind: 'pitchDrag', eventId: only, pitch: note.pitch };
  }

  return box;
}

/**
 * `classifyPointerDown`, then the one write a gesture needs before it starts:
 * a move off the selection selects the pressed chord through `selectNotes`, so
 * the notes being dragged are the notes that look selected, on the active
 * track, with the caret on them.
 */
export function startPointerGesture<T extends EditingState>(
  store: EditingStoreApi<T>,
  hit: ScoreHit | null,
  modifiers: { alt: boolean; shift: boolean }
): PointerGesture {
  const gesture = classifyPointerDown(store.getState(), hit, modifiers);
  if (gesture.kind === 'move' && gesture.selectChord)
    selectNotes(store, gesture.selectChord);
  return gesture;
}

/**
 * Commit a box select: the notes the box covered replace the selection, or join
 * it when `additive`. Deliberately leaves the caret and the active track alone
 * — a box is about which notes, not where you are.
 */
export function applyBoxSelection<T extends EditingState>(
  store: EditingStoreApi<T>,
  ids: readonly UUID[],
  additive: boolean
): void {
  const state = store.getState();
  const eventIds = additive
    ? Array.from(new Set([...state.selection.eventIds, ...ids]))
    : [...ids];
  state.setSelection({ eventIds, measureIds: [], trackIds: [] });
}

function noteAt(
  score: NonNullable<EditingState['score']>,
  id: UUID
): NoteEvent | null {
  const event = findEvent(score, id);
  return event && isNoteEvent(event) ? event : null;
}
