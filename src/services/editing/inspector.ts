/**
 * The property sheet's rules, stated once for both apps.
 *
 * Both apps draw an inspector — Score, Track, Note and Bar tabs of fields —
 * and each had worked out the same things inline: which tab opens for a
 * selection, what a typed tempo commits, which clefs a bar's picker offers,
 * when Replace is available, what the repair toast says. They agreed on most
 * of it by accident and disagreed on the rest without anyone choosing to: the
 * native tabs opened in a different order, its bar-clef picker read the
 * *active* track rather than the bar's own, and its tempo field wrote an
 * unrounded, unclamped value and an event even when nothing had changed.
 *
 * Everything here reflects state or invokes an editing operation. The words
 * stay in each host — these answer with i18n keys and values.
 */
import type {
  Clef,
  InspectorTab,
  Measure,
  MeasureClefValue,
  ReplaceScope,
  ScoreSelection,
  Track,
  UUID,
} from '@sudobility/music_types';
import {
  CLEFS,
  INHERIT_CLEF,
  MIX_ONLY_CONTROLS,
  clampBpm,
  effectiveClef,
  measureIndexOf,
  parseNumericDraft,
  replacementRegion,
  tempoAtBar,
  trackOfMeasure,
} from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
  TransportAwareness,
} from '../../store/editing-store.js';
import { selectActiveTrackId } from '../../store/selectors.js';
import { selectionKind } from './selection-kind.js';
import { setMeasureClef, setTempoAt } from './editing.js';

// ---- tabs --------------------------------------------------------------------

/**
 * The tab a fresh selection opens.
 *
 * What the selection is *of*, by `selectionKind`'s priority — notes, then
 * bars, then a track — and Track when nothing is selected, because the Note
 * and Bar tabs are an empty state until something is. A host re-derives this
 * when the selection's kind changes and otherwise leaves the reader's own tab
 * choice alone.
 */
export function defaultInspectorTab(
  selection: Pick<ScoreSelection, 'eventIds' | 'measureIds' | 'trackIds'>
): InspectorTab {
  const kind = selectionKind({ ...selection });
  if (kind === 'notes') return 'note';
  if (kind === 'measures') return 'measure';
  return 'track';
}

// ---- the edit lock -----------------------------------------------------------

/**
 * Whether content controls are locked: the transport is playing.
 *
 * The store already refuses a content command while playing; this is the same
 * rule asked ahead of time so a control can be *disabled* rather than looking
 * live and doing nothing. It covers every Note-tab field (decision 4 of the
 * parity plan: both apps disable the whole tab), every Bar and Score field, and
 * the Track tab's name, instrument, clef, delete and Replace.
 */
export function selectEditLocked(state: TransportAwareness): boolean {
  return state.state === 'playing';
}

/** Whether the named control is disabled right now. Unknown names lock. */
export function controlLocked(
  state: TransportAwareness,
  control: string
): boolean {
  if (!selectEditLocked(state)) return false;
  return !(MIX_ONLY_CONTROLS as readonly string[]).includes(control);
}

// ---- the note tab ------------------------------------------------------------

/**
 * Whether the chord-symbol and fingering fields are shown: exactly one note.
 *
 * Both are free text belonging to one notehead, and a draft seeded from the
 * first of several notes would overwrite the rest with its value on blur.
 */
export function noteTextFieldsVisible(notes: readonly unknown[]): boolean {
  return notes.length === 1;
}

// ---- the bar tab -------------------------------------------------------------

/**
 * Commit the Bar tab's "Tempo here" draft.
 *
 * Parsed, rounded and clamped to the validator's bounds; blank or non-numeric
 * text commits nothing. The bar's own event is edited by id when it has one,
 * so the opening tempo is changed rather than shadowed by a second event at
 * tick 0. A value equal to the (rounded) tempo already in force is skipped:
 * the field shows that rounded number, so blurring it untouched must not write
 * an event or an undo entry.
 *
 * Returns whether anything was written; on `false` the host resets its draft
 * to the tempo in force.
 */
export function commitBarTempo<T extends EditingState>(
  store: EditingStoreApi<T>,
  measure: Measure,
  text: string
): boolean {
  const score = store.getState().score;
  if (!score) return false;
  const parsed = parseNumericDraft(text);
  if (parsed === null) return false;
  const bpm = clampBpm(parsed);
  const here = tempoAtBar(score, measure);
  if (bpm === Math.round(here.bpm)) return false;
  return setTempoAt(store, {
    ...(here.ownEventId ? { tempoEventId: here.ownEventId } : {}),
    tick: measure.startTick,
    bpm,
  });
}

/**
 * Set, or with `undefined` clear, the clef change at a bar.
 *
 * Works out the track and index from the measure itself. The native panel used
 * the *active* track's clef and wrote to it, which on a score where the bar you
 * selected belongs to another part edits the wrong stave.
 */
export function setClefAtMeasure<T extends EditingState>(
  store: EditingStoreApi<T>,
  measureId: UUID,
  clef: Clef | undefined
): boolean {
  const score = store.getState().score;
  if (!score) return false;
  const track = trackOfMeasure(score, measureId);
  const index = measureIndexOf(score, measureId);
  if (!track || index === null) return false;
  setMeasureClef(store, track.id, index, clef);
  return true;
}

/**
 * What the bar-clef picker shows and offers.
 *
 * `inForce` is the clef the bar reads in, for the Inherit option's label
 * (`inspector.clefInherit` with `{ clef }`). Bar 1 establishes the part's clef
 * rather than changing it, so it offers no Inherit and shows the clef in force;
 * every later bar shows its own change, or Inherit when it has none.
 */
export function measureClefOptions(
  track: Track,
  index: number
): {
  value: MeasureClefValue;
  inForce: Clef;
  options: readonly MeasureClefValue[];
} {
  const inForce = effectiveClef(track, index);
  const own = track.measures[index]?.clef;
  if (index === 0) return { value: own ?? inForce, inForce, options: CLEFS };
  return {
    value: own ?? INHERIT_CLEF,
    inForce,
    options: [INHERIT_CLEF, ...CLEFS],
  };
}

// ---- replace -----------------------------------------------------------------

/**
 * Whether a tab's Replace button is available.
 *
 * `replacementRegion` is the single answer to "is there anything to replace" —
 * the same region the job will use — and the transport must not be playing,
 * since the result is written into the score.
 */
export function canReplace(state: EditingState, scope: ReplaceScope): boolean {
  if (!state.score || selectEditLocked(state)) return false;
  return (
    replacementRegion(
      state.score,
      state.selection,
      selectActiveTrackId(state),
      scope
    ) !== null
  );
}

// ---- repairing issues --------------------------------------------------------

/**
 * What to tell the reader after `repairAllIssues`, and whether the issue list
 * can close.
 *
 * The toast reports what actually left the list, not what was attempted —
 * several rules have no repair that is not a guess about the music, and saying
 * "fixed everything" over a list that still has entries is a lie the reader
 * can see. The list closes only when it is empty.
 */
export function repairIssuesOutcome(result: {
  fixed: number;
  remaining: number;
}): {
  messageKey: string;
  params: Record<string, number>;
  severity: 'info' | 'success';
  close: boolean;
} {
  const close = result.remaining === 0;
  if (result.fixed === 0)
    return {
      messageKey: 'editor.fixedNothing',
      params: {},
      severity: 'info',
      close: false,
    };
  if (result.remaining > 0)
    return {
      messageKey: 'editor.fixedIssuesPartial',
      params: { count: result.fixed, remaining: result.remaining },
      severity: 'success',
      close,
    };
  return {
    messageKey: 'editor.fixedIssues',
    params: { count: result.fixed },
    severity: 'success',
    close,
  };
}
