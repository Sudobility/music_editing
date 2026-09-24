/**
 * One editing store, for one document.
 *
 * This is the shape a native app needs: several documents open at once, each
 * with its own score, selection, caret, undo history and dirty flag, and no
 * global state anywhere in it. The web app does not use this — it composes the
 * same slices into its single application store alongside playback, generation
 * and project state — and that is the point. One set of slices, two shapes.
 *
 * The requirements the editing engine declares rather than owns are seeded
 * here with the honest defaults for a store standing on its own: the transport
 * is stopped. Pass `onChanged` to hear about edits — that is the whole
 * interface between editing and saving, and saving happens on your side of it.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { EditingState, NotifyChanged } from './editing-store.js';
import { createScoreSlice } from './slices/score-slice.js';
import { createSelectionSlice } from './slices/selection-slice.js';
import { createTrackSlice } from './slices/track-slice.js';
import { createUiSlice } from './slices/ui-slice.js';
import { createUnpluggedSlice } from './slices/unplugged-slice.js';

export type CreateEditingStoreOptions = {
  /**
   * Called once whenever an edit changes something worth persisting.
   *
   * The engine says what happened and stops there. What saving means — an
   * autosave debounce, a file write, a document marked dirty in a tab bar —
   * is yours, and one store per document means one of these per document.
   */
  onChanged?: NotifyChanged;
};

/** A fresh, independent editing store. Every one has its own undo history. */
export function createEditingStore(options: CreateEditingStoreOptions = {}) {
  return create<EditingState>()(
    immer((set, get) => {
      const changed: NotifyChanged = () => options.onChanged?.();
      return {
        state: 'stopped' as const,
        ...createScoreSlice<EditingState>({ set, get, changed }),
        ...createSelectionSlice<EditingState>({ set, get, changed }),
        ...createTrackSlice<EditingState>({ set, get, changed }),
        ...createUiSlice<EditingState>({ set, get, changed }),
        ...createUnpluggedSlice<EditingState>({ set, get, changed }),
      };
    })
  );
}

export type EditingStore = ReturnType<typeof createEditingStore>;
