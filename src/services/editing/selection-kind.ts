/**
 * What a selection is *of*, and what the clipboard is holding.
 *
 * The context menu acts on one of three things — a track, a span of bars, or a
 * run of notes — and every entry on it (Copy, Cut, Clear, Delete, Paste) means
 * something different for each. One place decides which, so the menu, the
 * clipboard and the commands cannot disagree about what "the selection" is.
 *
 * **Notes win, then measures, then tracks.** A note click sets `eventIds` and
 * leaves the track active, so a selection almost always carries a track id as
 * well; reading the track first would make every note selection look like a
 * track selection. This is the same priority the inspector already uses to pick
 * its opening tab, and it is stated once here rather than a second time there.
 */
import type {
  ClipboardData,
  ScoreSelection,
  SelectionKind,
} from '@sudobility/music_types';

export function selectionKind(selection: ScoreSelection): SelectionKind | null {
  if (selection.eventIds.length > 0) return 'notes';
  if (selection.measureIds.length > 0) return 'measures';
  if (selection.trackIds.length > 0) return 'track';
  return null;
}

/** What the clipboard is holding, or null when it is empty. */
export function clipboardKind(
  clipboard: ClipboardData | null
): SelectionKind | null {
  return clipboard?.kind ?? null;
}

/**
 * Whether Paste should be offered at all.
 *
 * Only when the two are the same kind: pasting a track over a run of notes has
 * no meaning anybody could predict, and offering it as a live control that then
 * does something arbitrary is worse than not offering it. Nothing selected and
 * a full clipboard is also a no — paste has to land somewhere.
 */
export function canPasteInto(
  selection: ScoreSelection,
  clipboard: ClipboardData | null
): boolean {
  const kind = selectionKind(selection);
  return kind !== null && kind === clipboardKind(clipboard);
}
