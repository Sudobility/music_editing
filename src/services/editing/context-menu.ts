/**
 * The score's context menu — right-click on the web, long press on native — as
 * a model rather than as two components.
 *
 * Both apps drew the same six entries in the same order with the same enabled
 * rules and the same subject header, and both wrote those rules out inside the
 * component. A seventh entry, or a change to what is live during playback,
 * would have had to be made twice and could be made once. The components keep
 * what is genuinely theirs: a positioned list on the web, a sheet on a phone,
 * because a popover anchored to a finger is under the finger.
 *
 * Keys, never words: this package holds no strings in any language.
 */
import type { Score, ScoreSelection } from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import type { ClipboardData } from '../../store/slices/selection-slice.js';
import { clearSelected, deleteSelected, selectAll } from './editing.js';
import { canPasteInto, selectionKind } from './selection-kind.js';

/** Every entry, in the order the menu shows them. */
export const SCORE_CONTEXT_ACTIONS = [
  'copy',
  'cut',
  'clear',
  'delete',
  'paste',
  'selectAll',
] as const;

export type ScoreContextAction = (typeof SCORE_CONTEXT_ACTIONS)[number];

/** The label each entry is read as. A record, so a new action fails to compile here. */
export const SCORE_CONTEXT_ACTION_LABEL_KEY: Record<
  ScoreContextAction,
  string
> = {
  copy: 'editor.copy',
  cut: 'editor.cut',
  clear: 'editor.clear',
  delete: 'editor.deleteSelection',
  paste: 'editor.paste',
  selectAll: 'editor.selectAllNotes',
};

export type ScoreContextMenuEntry = {
  action: ScoreContextAction;
  labelKey: string;
  enabled: boolean;
};

export type ScoreContextMenuModel = {
  /** The menu's accessible name / sheet title. */
  titleKey: string;
  /**
   * What every entry acts on — "Track", "Bars", "Notes" — or null with nothing
   * selected. `count` is for the plural; translate with `{ count }`.
   */
  subject: { key: string; count: number } | null;
  entries: readonly ScoreContextMenuEntry[];
};

/**
 * The menu for this selection.
 *
 * **An entry that would do nothing is disabled, never hidden**, so the menu has
 * the same shape and reading order every time it opens. Copy only reads, so it
 * stays live while the transport plays — the same exemption the edit lock
 * makes everywhere; every other content entry goes dead. Paste needs a
 * clipboard of the selection's own kind (`canPasteInto`). Select All is always
 * there.
 *
 * Pass `score` to count bars properly: a bar selected across four tracks is
 * four measure ids and **one** bar, and both apps' headers used to say "4 bars".
 * Without a score the id count is the best available answer.
 */
export function scoreContextMenuModel(input: {
  selection: ScoreSelection;
  clipboard: ClipboardData | null;
  playing: boolean;
  score?: Score | null;
}): ScoreContextMenuModel {
  const { selection, clipboard, playing } = input;
  const kind = selectionKind(selection);
  const has = kind !== null;
  const canEdit = !playing;

  const enabled: Record<ScoreContextAction, boolean> = {
    copy: has,
    cut: canEdit && has,
    clear: canEdit && has,
    delete: canEdit && has,
    paste: canEdit && canPasteInto(selection, clipboard),
    selectAll: true,
  };

  const subject =
    kind === null
      ? null
      : kind === 'track'
        ? { key: 'editor.subjectTrack', count: 1 }
        : kind === 'measures'
          ? {
              key: 'editor.subjectBars',
              count: barCountOf(selection, input.score ?? null),
            }
          : { key: 'editor.subjectNotes', count: selection.eventIds.length };

  return {
    titleKey: 'editor.scoreActions',
    subject,
    entries: SCORE_CONTEXT_ACTIONS.map(action => ({
      action,
      labelKey: SCORE_CONTEXT_ACTION_LABEL_KEY[action],
      enabled: enabled[action],
    })),
  };
}

/** How many distinct bars a measure selection covers. */
function barCountOf(selection: ScoreSelection, score: Score | null): number {
  if (!score) return selection.measureIds.length;
  const wanted = new Set(selection.measureIds);
  const indices = new Set<number>();
  for (const track of score.tracks)
    for (const measure of track.measures)
      if (wanted.has(measure.id)) indices.add(measure.index);
  return indices.size;
}

/**
 * What the host lends the menu: the cut and paste questions.
 *
 * Cut and paste can each have two outcomes, and the menu must ask the same
 * question the shortcut does — so these are the same callbacks
 * `EditorShortcutHost` takes (`useClipboardPrompts` supplies both). Optional:
 * without them the store actions' own defaults apply.
 */
export type ScoreContextPrompts = {
  requestCut?: () => void;
  requestPaste?: () => void;
};

/**
 * Perform a menu entry, and say whether it ran.
 *
 * Re-checks the model against the store as it is *now*, so an entry chosen
 * after the transport started — a sheet left open, a stale menu — is refused
 * rather than trusted to the component's disabled flag. The native app had
 * written that guard by hand; the web relied on the flag alone.
 */
export function runScoreContextAction<T extends EditingState>(
  store: EditingStoreApi<T>,
  action: ScoreContextAction,
  prompts: ScoreContextPrompts = {}
): boolean {
  const state = store.getState();
  const model = scoreContextMenuModel({
    selection: state.selection,
    clipboard: state.clipboard,
    playing: state.state === 'playing',
    score: state.score,
  });
  if (!model.entries.find(e => e.action === action)?.enabled) return false;

  switch (action) {
    case 'copy':
      state.copySelection();
      break;
    case 'cut':
      if (prompts.requestCut) prompts.requestCut();
      else state.cutSelection();
      break;
    case 'paste':
      if (prompts.requestPaste) prompts.requestPaste();
      else state.paste();
      break;
    case 'clear':
      clearSelected(store);
      break;
    case 'delete':
      deleteSelected(store);
      break;
    case 'selectAll':
      selectAll(store);
      break;
  }
  return true;
}
