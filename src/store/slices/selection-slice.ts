/**
 * Selection slice (spec §9, §37.13): the one place `ScoreSelection` lives,
 * shared by the sheet editor, piano roll, inspector, regeneration panel,
 * playback loop controls, and copy/paste/delete/quantize actions. Also
 * owns the clipboard and the copy/cut/paste actions, since "what's
 * selected" and "what's on the clipboard" are tightly coupled (paste needs
 * to know where the current selection implies content should land).
 */
import { allNotes, findEvent, findTrack } from '@sudobility/music_types';
import { selectionToRange } from '@sudobility/music_types';
import { emptySelection } from '@sudobility/music_types';
import type { ScoreSelection } from '@sudobility/music_types';
import type {
  ClipboardData,
  MeasureSlice,
  NoteEvent,
  Score,
  UUID,
} from '@sudobility/music_types';
import { isNoteEvent } from '@sudobility/music_types';
import { pasteEventsCommand } from '@sudobility/music_types';
import { deleteEventsCommand } from '@sudobility/music_types';
import {
  clearMeasuresCommand,
  clearTrackCommand,
  deleteMeasureCommand,
  deleteTrackCommand,
  insertMeasuresCommand,
  insertTrackCommand,
  replaceMeasuresCommand,
  replaceTrackCommand,
} from '@sudobility/music_types';
import { commandLabel, editingCopy } from '../../services/editing/copy.js';
import { refuseOutOfRangeArrival } from '../../services/editing/range-refusal.js';
import { selectionKind } from '../../services/editing/selection-kind.js';
import { closeGap, makeRoom } from '@sudobility/music_types';
import { transformCommand } from '@sudobility/music_types';
import type { EditingState, SliceArgs } from '../editing-store.js';
import { getMusicSelectionSource } from '../../services/selection/singleton.js';
import { getMusicPositionSource } from '@sudobility/music_types';
import { selectActiveTrackId, selectEffectiveEditMode } from '../selectors.js';

export type SelectionSlice = {
  selection: ScoreSelection;
  /**
   * True when the current selection is the direct product of an accepted
   * regeneration — those notes draw in `theme.noteRegenerated` (brown)
   * instead of the normal selected color.
   *
   * Cleared by `setSelection`, and therefore by every selection action
   * (`toggleEvent`/`selectMeasures`/`selectTrack`/`clearSelection` all funnel
   * through it), which is what makes "brown until the selection changes"
   * hold without any other code knowing about the flag. Set only by
   * `generation-slice.acceptCandidate`.
   */
  /**
   * Whether the current selection is material a generation just produced, so
   * the editor can colour it distinctly.
   *
   * Written only by `selectRegenerated`; every ordinary selection change
   * clears it. Its previous writer was the candidate-accept workflow, which
   * generation-as-a-job replaced.
   */
  selectionRegenerated: boolean;
  clipboard: ClipboardData | null;

  setSelection: (selection: ScoreSelection) => void;
  /** Selects notes a generation just wrote, marking them `selectionRegenerated`. */
  selectRegenerated: (eventIds: readonly string[]) => void;
  /** Adds `eventId` to the selection if absent, removes it if present; leaves `measureIds`/`trackIds`/`range` untouched. */
  toggleEvent: (eventId: UUID) => void;
  /** Replaces the selection with a fresh measure-based selection (e.g. clicking a measure header, or the acceptance-criteria "select measures 3 and 4" for regeneration). */
  selectMeasures: (measureIds: UUID[]) => void;
  /** Replaces the selection with a fresh track-scoped selection (e.g. clicking a track header). */
  selectTrack: (trackId: UUID) => void;
  clearSelection: () => void;

  /** Copies the currently-selected note events to the clipboard (no-op if nothing selected resolves to a note). */
  copySelection: () => void;
  /** Copies, then deletes, the currently-selected notes as one undoable command. */
  /**
   * Copies the selection, then removes it.
   *
   * `closeGap` slides the rest of the track earlier to fill the hole; without
   * it the notes are simply gone and the time they occupied becomes rests.
   * Which one is wanted is not something the editor can infer, so the caller
   * decides — see the cut dialog.
   */
  cutSelection: (options?: { closeGap?: boolean }) => void;
  /**
   * Pastes notes at `atTick` (the current cursor by default) onto the selected
   * or active track. Other clipboard kinds use their selected target.
   *
   * `scope` decides what happens to music already there: `replace` clears the
   * span first, `insert` pushes it later. Omitted, it follows `editMode` — so
   * a caller that has already asked the user can pass their answer, and one
   * that has not still behaves consistently with note entry.
   */
  paste: (
    atTick?: number,
    options?: { scope?: 'replace' | 'insert' | 'stack' }
  ) => void;
};

/**
 * The bar indices a measure selection covers, in order.
 *
 * By *index*, not by id: a measure id belongs to one track, and a bar is the
 * same bar on every stave. Two tracks' ids for bar 3 are one selection of bar 3.
 */
function selectedMeasureIndices(
  score: Score,
  selection: ScoreSelection
): number[] {
  const wanted = new Set(selection.measureIds);
  const indices = new Set<number>();
  for (const track of score.tracks)
    for (const measure of track.measures)
      if (wanted.has(measure.id)) indices.add(measure.index);
  return [...indices].sort((a, b) => a - b);
}

/**
 * What copying this selection puts on the clipboard, or null if there is
 * nothing to copy.
 *
 * Shared by Copy and by Cut, so the two cannot come to disagree about what was
 * taken — which is the bug that made cut-then-paste lose a track's instrument
 * while copy-then-paste kept it.
 */
function clipboardFor(
  score: Score,
  selection: ScoreSelection
): ClipboardData | null {
  const kind = selectionKind(selection);
  if (kind === 'notes') {
    const events = selection.eventIds
      .map(id => findEvent(score, id))
      .filter(
        (event): event is NoteEvent => event !== null && isNoteEvent(event)
      );
    if (events.length === 0) return null;
    return {
      kind: 'notes',
      events,
      anchorTick: Math.min(...events.map(e => e.startTick)),
      fromCut: false,
    };
  }
  if (kind === 'measures') {
    const indices = selectedMeasureIndices(score, selection);
    if (indices.length === 0) return null;
    // The span from the first to the last, so a selection with a hole in it
    // still copies as the run of bars a reader sees.
    const from = indices[0] as number;
    const to = (indices[indices.length - 1] as number) + 1;
    const slice = sliceOf(score, from, to);
    return { kind: 'measures', slice, count: slice.count, fromCut: false };
  }
  if (kind === 'track') {
    const track = score.tracks.find(t => t.id === selection.trackIds[0]);
    return track ? { kind: 'track', track, fromCut: false } : null;
  }
  return null;
}

/** The bars at [from, to) across every track — a vertical slice of the score. */
function sliceOf(score: Score, from: number, to: number): MeasureSlice {
  return {
    count: to - from,
    tracks: score.tracks.map(track => track.measures.slice(from, to)),
  };
}

/** The selected track, selected note's track, or the currently active track. */
function resolvePasteTrackId(
  score: Score,
  selection: ScoreSelection,
  activeTrackId: UUID | null
): UUID | null {
  if (selection.trackIds.length > 0) return selection.trackIds[0];
  for (const eventId of selection.eventIds) {
    const event = findEvent(score, eventId);
    if (event) return event.trackId;
  }
  const range = selectionToRange(score, selection);
  if (range && range.trackIds.length > 0) return range.trackIds[0];
  return activeTrackId ?? score.tracks[0]?.id ?? null;
}

export const createSelectionSlice = <T extends EditingState>({
  set,
  get,
}: SliceArgs<T>): SelectionSlice => {
  /*
    The score a cut left behind, while nothing has been done since.

    A refused paste offers Undo only when undoing would reverse *the cut*. Once
    any other edit has landed, the top of the history is that edit, and a
    button promising to bring the notes back would take something else away
    instead. Held in the closure rather than the state: it is bookkeeping for
    one rule, and nothing should render from it or persist it.
  */
  let scoreAfterCut: Score | null = null;

  return {
    selection: emptySelection(),
    selectionRegenerated: false,
    clipboard: null,

    /** Selects notes a generation just wrote, and marks them as such. */
    selectRegenerated: eventIds => {
      set(state => {
        state.selection = {
          eventIds: [...eventIds],
          measureIds: [],
          trackIds: [],
        };
        state.selectionRegenerated = eventIds.length > 0;
      });
    },

    setSelection: selection => {
      set(state => {
        state.selection = selection;
        state.selectionRegenerated = false;
      });
      // The one write path, so this is where `IMusicSelection` is told. Every
      // other selection action in this slice routes through here — toggling a
      // note, selecting measures, clicking a track, clearing — which is what
      // makes a single report enough to keep the shared selection exact.
      getMusicSelectionSource().setSelection(selection);
      // Routed through the observer (rather than this slice writing another
      // slice's field) so whoever owns that field stays the only code that
      // touches it — and optional, because a store with no AI generation in it
      // has nothing to keep in step.
      get().syncModeFromSelection?.(selection);
    },

    toggleEvent: eventId => {
      const current = get().selection;
      const eventIds = current.eventIds.includes(eventId)
        ? current.eventIds.filter(id => id !== eventId)
        : [...current.eventIds, eventId];
      get().setSelection({ ...current, eventIds });
    },

    selectMeasures: measureIds => {
      get().setSelection({ eventIds: [], measureIds, trackIds: [] });
    },

    selectTrack: trackId => {
      get().setSelection({ eventIds: [], measureIds: [], trackIds: [trackId] });
    },

    clearSelection: () => {
      get().setSelection(emptySelection());
    },

    copySelection: () => {
      const { score, selection } = get();
      if (!score) return;
      const data = clipboardFor(score, selection);
      if (!data) return;
      set(state => {
        state.clipboard = data;
      });
    },

    cutSelection: options => {
      const { score, selection } = get();
      if (!score) return;
      const kind = selectionKind(selection);
      if (!kind) return;

      // Copy first, always: cut is copy plus a removal, and a removal that
      // happened without the copy is a delete somebody cannot undo by pasting.
      get().copySelection();
      if (!get().clipboard) return;
      set(state => {
        if (state.clipboard) state.clipboard.fromCut = true;
      });

      if (kind === 'notes') {
        const cutNotes = selection.eventIds
          .map(id => findEvent(score, id))
          .filter(
            (event): event is NoteEvent => event !== null && isNoteEvent(event)
          );
        if (cutNotes.length === 0) return;

        // Measured before the delete, while the notes are still there to measure.
        const trackId = cutNotes[0].trackId;
        const sameTrack = cutNotes.every(note => note.trackId === trackId);
        const fromTick = Math.min(...cutNotes.map(note => note.startTick));
        const toTick = Math.max(
          ...cutNotes.map(note => note.startTick + note.durationTicks)
        );

        const remove = deleteEventsCommand(
          cutNotes.map(note => note.id),
          commandLabel('deleteEvents')
        );

        // Only for a single-track cut: sliding one track earlier while the others
        // stay put is exactly the desynchronisation `insert` mode exists for, and
        // doing it to several tracks at once by accident would be worse.
        //
        // One command either way, so one undo brings the notes back. Removing
        // and then closing the gap as two steps left the first Undo restoring a
        // gap with nothing in it.
        get().dispatchCommand(
          options?.closeGap && sameTrack
            ? transformCommand(commandLabel('deleteEvents'), current =>
                closeGap(
                  remove.execute(current),
                  trackId,
                  fromTick,
                  toTick - fromTick
                )
              )
            : remove
        );
      } else if (kind === 'measures') {
        const indices = selectedMeasureIndices(score, selection);
        if (indices.length === 0) return;
        if (options?.closeGap) {
          // Descending, so each removal cannot move the next one's index.
          for (const index of [...indices].reverse())
            get().dispatchCommand(
              deleteMeasureCommand(index, commandLabel('deleteMeasure'))
            );
        } else {
          get().dispatchCommand(
            clearMeasuresCommand(
              selection.measureIds,
              commandLabel('clearBars')
            )
          );
        }
      } else {
        const trackId = selection.trackIds[0];
        if (!trackId) return;
        get().dispatchCommand(
          options?.closeGap
            ? deleteTrackCommand(trackId, commandLabel('deleteTrack'))
            : clearTrackCommand(trackId, commandLabel('clearTrack'))
        );
      }

      get().clearSelection();
      scoreAfterCut = get().score;
    },

    paste: (atTick, options) => {
      const { score, clipboard, selection } = get();
      if (!score || !clipboard) return;
      /*
      A measure or track paste needs a target of its own kind; a note paste does
      not, and deliberately.

      `canPasteInto` is the stricter rule and it belongs to the *menu*: an entry
      that would do something unpredictable should not be offered. But paste is
      also Cmd+V, and copying a phrase, clicking into another part — which moves
      the caret and selects nothing — and pasting is the ordinary way to use it.
      `resolvePasteTrackId` has always handled every one of those cases, so
      refusing here would break the keyboard to enforce a rule about a menu.
    */
      if (
        clipboard.kind !== 'notes' &&
        selectionKind(selection) !== clipboard.kind
      )
        return;

      // Paste obeys the edit mode for the same reason entry does: pasting on top
      // of existing music is the same question as playing on top of it, and
      // answering it differently in the two places would be arbitrary. The mode
      // *in effect*, like entry: stack on a part that cannot play a chord reads
      // as replace, and pasting chords onto a flute because a mode chosen on a
      // piano was still stored would contradict the bar.
      const scope = options?.scope ?? selectEffectiveEditMode(get());

      if (clipboard.kind === 'measures') {
        const indices = selectedMeasureIndices(score, selection);
        const at = indices[0];
        if (at === undefined) return;
        get().dispatchCommand(
          scope === 'insert'
            ? insertMeasuresCommand(
                at,
                clipboard.slice,
                commandLabel('pasteBars')
              )
            : replaceMeasuresCommand(
                at,
                clipboard.slice,
                commandLabel('pasteBars')
              )
        );
        get().clearSelection();
        return;
      }

      if (clipboard.kind === 'track') {
        const targetId = selection.trackIds[0];
        if (!targetId) return;
        const at = score.tracks.findIndex(t => t.id === targetId);
        if (at < 0) return;
        get().dispatchCommand(
          scope === 'insert'
            ? // Before the selected part, matching what inserting bars does:
              // the thing you pasted onto moves down, it is not overwritten.
              insertTrackCommand(
                clipboard.track,
                at,
                commandLabel('pasteTrack')
              )
            : replaceTrackCommand(
                targetId,
                clipboard.track,
                commandLabel('pasteTrack')
              )
        );
        get().clearSelection();
        return;
      }

      if (clipboard.events.length === 0) return;
      const trackId = resolvePasteTrackId(
        score,
        selection,
        selectActiveTrackId(get())
      );
      if (!trackId) return;
      // Notes pasted onto a different part are new to its instrument, and are
      // refused if it cannot play them, exactly as typing them would be. Notes
      // pasted back onto the part they came from are not checked: that is a cut
      // and paste along one part — the clipboard's version of moving notes in
      // time — and refusing it after the cut had already removed them would
      // lose an imported passage to a toast.
      //
      // After a cut the refusal offers Undo, because the notes are then nowhere
      // but the history — and only while the cut is still the last thing done.
      const undoCut =
        clipboard.fromCut && scoreAfterCut !== null && scoreAfterCut === score
          ? { label: editingCopy().undoAction(), onClick: () => get().undo() }
          : undefined;
      if (
        refuseOutOfRangeArrival(
          { getState: get },
          findTrack(score, trackId),
          clipboard.events
            .filter(event => event.trackId !== trackId)
            .map(event => event.pitch),
          'paste',
          undoCut
        )
      )
        return;
      const anchorTick = atTick ?? getMusicPositionSource().reportedTick;

      // How much time the clipboard occupies, measured from its own earliest
      // start — the same span the paste will cover once anchored.
      const clipStart = Math.min(...clipboard.events.map(e => e.startTick));
      const clipEnd = Math.max(
        ...clipboard.events.map(e => e.startTick + e.durationTicks)
      );
      const span = clipEnd - clipStart;

      if (scope === 'insert') {
        get().dispatchCommand(
          transformCommand(commandLabel('pasteEvents'), current =>
            makeRoom(current, trackId, anchorTick, span)
          )
        );
      } else if (scope === 'replace') {
        // Cleared explicitly, because reflow clusters same-span notes into a
        // chord rather than replacing them — so leaving it implicit would make
        // replace behave as stack whenever the lengths happened to match.
        const occupying = allNotes(get().score ?? score)
          .filter(
            note =>
              note.trackId === trackId &&
              note.startTick < anchorTick + span &&
              note.startTick + note.durationTicks > anchorTick
          )
          .map(note => note.id);
        if (occupying.length > 0)
          get().dispatchCommand(
            deleteEventsCommand(occupying, commandLabel('deleteEvents'))
          );
      }

      get().dispatchCommand(
        pasteEventsCommand(
          clipboard.events,
          {
            trackId,
            voiceIndex: 0,
            anchorTick,
          },
          commandLabel('pasteEvents')
        )
      );
    },
  };
};
