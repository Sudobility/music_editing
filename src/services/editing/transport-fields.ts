/**
 * The transport bar's tempo field.
 *
 * Both apps show the opening tempo as a whole number and commit what was typed
 * into `tempoMap[0]`. The web rounded (`Math.round(Number(draft))`) and did not
 * clamp, so "9999" was stored and then flagged by the validator; an emptied
 * field was `Number('')`, which is 0 and was refused only because
 * `setOpeningTempo` happens to refuse non-positive tempos. The rule is the
 * field's, not either bar's: blank or non-numeric is no change, anything else
 * is rounded and bounded, and a value already there is not an undo entry.
 */
import type { Score } from '@sudobility/music_types';
import {
  DEFAULT_BPM,
  clampBpm,
  parseNumericDraft,
} from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import { setOpeningTempo } from './editing.js';

/** The opening tempo as the field shows it: whole, and never blank. */
export function openingTempoBpm(score: Score | null): number {
  return Math.round(score?.tempoMap[0]?.bpm ?? DEFAULT_BPM);
}

/** Commits typed tempo text; returns whether the score changed. */
export function commitOpeningTempoText<T extends EditingState>(
  store: EditingStoreApi<T>,
  text: string
): boolean {
  const score = store.getState().score;
  if (!score) return false;
  const parsed = parseNumericDraft(text);
  if (parsed === null) return false;
  const bpm = clampBpm(parsed);
  if (score.tempoMap[0]?.bpm === bpm) return false;
  return setOpeningTempo(store, bpm);
}
