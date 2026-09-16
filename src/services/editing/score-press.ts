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
 * The geometry stays with the renderer; the meaning is here. The hit is
 * music_types' `ScoreCanvasHit` — the one shape music_drawing's canvas answers
 * with and this reads — so a host passes the canvas's answer straight through.
 */
import type {
  NoteEvent,
  PointerGesture,
  ScoreCanvasHit,
  ScorePressModifiers,
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
  hit: ScoreCanvasHit | null,
  modifiers: ScorePressModifiers
): number | null {
  const state = store.getState();
  const { shift, mod, anchor } = modifiers;
  if (!state.score) return anchor;

  // Mod is decided before the hit, because it needs none: it selects from the
  // caret to wherever the point is in time. The bar-number band is the one
  // exception, below — Mod+Shift there means "this bar on every track".
  if (mod && hit?.kind !== 'measureNumber' && hit?.kind !== 'trackGutter') {
    if (modifiers.pointTick !== null)
      selectToTick(store, { tick: modifiers.pointTick, allTracks: shift });
    return anchor;
  }
  if (!hit) return anchor;

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
  hit: ScoreCanvasHit | null,
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
  hit: ScoreCanvasHit | null,
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
 * a move off the selection selects the pressed chord, so the notes being
 * dragged are the notes that look selected.
 *
 * **Only the selection changes** — not through `selectNotes`, which also aims
 * the caret and switches the active track. A move is about which notes, like a
 * box select; yanking the playhead to wherever a drag happened to start, and
 * re-colouring the staves before the drop has even picked a destination, is
 * what the web never did.
 */
export function startPointerGesture<T extends EditingState>(
  store: EditingStoreApi<T>,
  hit: ScoreCanvasHit | null,
  modifiers: { alt: boolean; shift: boolean }
): PointerGesture {
  const gesture = classifyPointerDown(store.getState(), hit, modifiers);
  if (gesture.kind === 'move' && gesture.selectChord)
    store.getState().setSelection({
      eventIds: [...gesture.selectChord],
      measureIds: [],
      trackIds: [],
    });
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
