/**
 * Score slice (spec §3, §14, §37.7): the single place the committed
 * `Score` lives in the store, plus the one `HistoryManager` (spec §14)
 * every mutation goes through. `HistoryManager` itself holds no `Score` —
 * `dispatchCommand`/`undo`/`redo` always pass the store's current `score`
 * in and write the result straight back (see `history.ts`).
 *
 * The `HistoryManager` instance is created once per store (inside this
 * slice's `StateCreator` closure, invoked exactly once per `create(...)`
 * call), not once per process: a literal process-wide module singleton
 * would leak undo/redo state between independently-created stores (e.g.
 * one per test file), which is exactly the kind of cross-test bleed the
 * rest of this codebase's DI conventions (see `services/persistence`)
 * avoid. One store is created for the running app (`useAppStore.ts`), so
 * in practice this is still "the one history manager" spec §37.7 asks for.
 */
import { HistoryManager } from '@sudobility/music_types';
import { getMusicPositionSource } from '@sudobility/music_types';
import type { ScoreCommand } from '@sudobility/music_types';
import type { TransportState } from '@sudobility/music_types';
import type { Score } from '@sudobility/music_types';
import { scoreWithResolvedKits } from '@sudobility/music_types';
import { validateScore } from '@sudobility/music_types';
import type { ValidationIssue } from '@sudobility/music_types';
import type { EditingState, SliceArgs } from '../editing-store.js';

export type SetScoreOptions = {
  /** Defaults to `true`: loading/replacing the whole score (open project, accept a fresh AI generation, import) starts a clean undo/redo stack. Pass `false` only when the caller has its own reason to keep history spanning the swap. */
  resetHistory?: boolean;
  /**
   * Defaults to `true`: a new score starts at the top, so the caret — the one
   * shared playback position — moves to 0.
   *
   * `false` for a store that is not the one being played: a host with a store
   * per document opens documents in the background, and there the shared
   * position belongs to the document in front. Moving it would send that
   * document's caret back to the start because a tab opened behind it.
   */
  resetPosition?: boolean;
};

export type ScoreSlice = {
  score: Score | null;
  validationIssues: ValidationIssue[];
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;

  /** Runs `cmd` through the store's `HistoryManager`, then updates `score`/`validationIssues`/undo-redo mirrors and marks the current project dirty. A no-op if there is no `score` yet. */
  dispatchCommand: (cmd: ScoreCommand) => void;
  undo: () => void;
  redo: () => void;
  /** Replaces `score` outright (open project, accept a freshly generated score, MIDI/MusicXML import at the app boundary). */
  setScore: (score: Score, options?: SetScoreOptions) => void;
};

/**
 * Whether `cmd` may run right now.
 *
 * While the transport is playing, the score's musical content is immutable.
 * Mixing is exempt — mute, solo, volume and pan reach the engine live through
 * `applyMix`, and muting a part while listening is how an arrangement gets
 * listened to, not editing.
 *
 * This is load-bearing for `services/playback/adapter.ts`: its "score
 * changed while playing" branch pushes mix state to the engine and does *not*
 * reload, which is only sound because this guarantees a content change cannot
 * have happened. Loosening the rule here without revisiting that will silently
 * play stale music.
 */
function commandAllowed(
  cmd: ScoreCommand,
  playbackState: TransportState
): boolean {
  return playbackState !== 'playing' || cmd.kind === 'mix';
}

export const createScoreSlice = <T extends EditingState>({
  set,
  get,
  changed,
}: SliceArgs<T>): ScoreSlice => {
  const historyManager = new HistoryManager();

  // Mute and solo are listening preferences, not score data. Keep them in the
  // score-shaped client state for the live mixer, but exclude them when
  // deciding whether an edit needs a server save. This also covers undo/redo
  // and prevents a UI-only action from becoming dirty through another path.
  function persistedScoreFingerprint(score: Score): string {
    return JSON.stringify({
      ...score,
      tracks: score.tracks.map(
        ({ muted: _muted, solo: _solo, ...track }) => track
      ),
    });
  }

  function syncHistoryMirrors(state: {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
  }): void {
    state.canUndo = historyManager.canUndo;
    state.canRedo = historyManager.canRedo;
    state.undoLabel = historyManager.undoLabel;
    state.redoLabel = historyManager.redoLabel;
  }

  return {
    score: null,
    validationIssues: [],
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,

    dispatchCommand: cmd => {
      const { score, state } = get();
      if (!score) return;
      if (!commandAllowed(cmd, state)) return;
      const next = historyManager.execute(cmd, score);
      set(state => {
        state.score = next;
        state.validationIssues = validateScore(next);
        syncHistoryMirrors(state);
      });
      get().localUiChanged?.();
      if (
        persistedScoreFingerprint(score) !== persistedScoreFingerprint(next)
      ) {
        changed();
      }
    },

    undo: () => {
      const score = get().score;
      // Undo is always content: it reverses whatever was done, and while
      // playing nothing that needs reversing can have happened.
      if (!score || get().state === 'playing' || !historyManager.canUndo)
        return;
      const previous = historyManager.undo(score);
      if (previous === null) return;
      set(state => {
        state.score = previous;
        state.validationIssues = validateScore(previous);
        syncHistoryMirrors(state);
      });
      get().localUiChanged?.();
      if (
        persistedScoreFingerprint(score) !== persistedScoreFingerprint(previous)
      ) {
        changed();
      }
    },

    redo: () => {
      const score = get().score;
      if (!score || get().state === 'playing' || !historyManager.canRedo)
        return;
      const next = historyManager.redo(score);
      if (next === null) return;
      set(state => {
        state.score = next;
        state.validationIssues = validateScore(next);
        syncHistoryMirrors(state);
      });
      get().localUiChanged?.();
      if (
        persistedScoreFingerprint(score) !== persistedScoreFingerprint(next)
      ) {
        changed();
      }
    },

    setScore: (score, options = {}) => {
      const resetHistory = options.resetHistory ?? true;
      if (resetHistory) historyManager.clear();
      // Inbound, before the score becomes what the store holds: a percussion
      // track's program is a drum kit, and a MIDI file may set an address no
      // kit sits at. Correcting it here rather than after means the project is
      // never marked dirty by it, so opening a score does not upload an edit
      // the user did not make; the correction persists with their next one.
      // Identity is preserved when there is nothing to correct.
      const resolved = scoreWithResolvedKits(score);
      // A new score starts at the top, and the caret is the shared position —
      // unless this store is not the one the position belongs to.
      if (options.resetPosition ?? true) getMusicPositionSource().moveTo(0);
      set(state => {
        state.score = resolved;
        state.validationIssues = validateScore(resolved);
        syncHistoryMirrors(state);
      });
    },
  };
};
