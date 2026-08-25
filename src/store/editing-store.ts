/**
 * The editing state, and how a slice is handed the store it lives in.
 *
 * This is the seam that lets one set of slices serve two shapes of store. The
 * web app composes them into a single global store alongside playback,
 * generation and project state; a native app with several documents open needs
 * one editing store PER DOCUMENT, with no global anything in it. Both are the
 * same slices.
 *
 * That is why a slice is generic over `T extends EditingState` rather than
 * written against one concrete `EditingState`. It was written against `EditingState`,
 * which is what made the editing half impossible to lift out: eight of the
 * twelve modules imported the composed store's type, and the composed store
 * imported them back.
 *
 * `SliceArgs` is deliberately narrower than zustand's `StateCreator`. Its
 * mutator tuple cannot be made generic — `[['zustand/immer', never]]` has to
 * name a concrete state — so the slices take the two things they actually use,
 * an immer-style setter and a getter, and stay composable.
 */
import type { ScoreSelection, TransportState } from '@sudobility/music_types';
import type { ScoreSlice } from './slices/score-slice.js';
import type { SelectionSlice } from './slices/selection-slice.js';
import type { TrackSlice } from './slices/track-slice.js';
import type { UiSlice } from './slices/ui-slice.js';

/**
 * What the editing engine needs to know about the transport, and nothing more.
 *
 * Content edits are refused while the transport plays — that rule is the whole
 * reason editing cares about playback at all. Declared here as a REQUIREMENT
 * rather than imported from a playback slice: the editing engine says what it
 * needs and whoever owns the transport supplies it. In the web app the
 * playback slice already provides this field; a standalone document store
 * seeds it and moves it itself.
 */
export type TransportAwareness = {
  state: TransportState;
};

/**
 * How the editing engine says the document changed.
 *
 * A callback handed in at construction, deliberately NOT an action on the
 * state. Saving is not editing's business — the web app has one autosaver on
 * one project, and a native app with several documents open would have one per
 * document — so the engine's whole responsibility is to say that something
 * worth saving changed, once, and let the owner decide what that means.
 *
 * It was a `markDirty` field on the state, which made it a shared mutable
 * action anything holding the store could fire. A callback cannot be fired by
 * a caller that was never given it, and it makes the direction obvious in the
 * type: editing informs outward, and nothing flows back.
 */
export type NotifyChanged = () => void;

/**
 * Things outside the editing engine that want to hear about a selection.
 *
 * Optional, because they genuinely are. The web app's generation slice keeps
 * its own mode in step with what is selected; a document store in a native
 * app that offers no AI has nothing to keep in step, and should not have to
 * supply a stub to say so. The editing engine calls what is there.
 */
export type SelectionObservers = {
  syncModeFromSelection?: (selection: ScoreSelection) => void;
};

/** Everything an editing operation may read or write. One document's worth. */
export type EditingState = ScoreSlice &
  SelectionSlice &
  TrackSlice &
  UiSlice &
  TransportAwareness &
  SelectionObservers;

/**
 * What a slice creator is handed.
 *
 * `T` is the state it is being composed into, which may carry more than
 * `EditingState` — the web app's store also holds playback, generation and
 * project state, and a slice must not care.
 */
export type SliceArgs<T extends EditingState> = {
  set: (updater: (draft: T) => void) => void;
  get: () => T;
  /** Call when an edit changes something worth persisting. */
  changed: NotifyChanged;
};

/**
 * A store an editing operation can be handed.
 *
 * Callable, because the app reads it as a hook (`store(s => s.score)`), and
 * generic so the app's wider store is accepted wherever an editing store is.
 */
export type EditingStoreApi<T extends EditingState = EditingState> = {
  <U>(selector: (state: T) => U): U;
  getState: () => T;
  setState: (updater: (draft: T) => void) => void;
  subscribe: (listener: (state: T, previous: T) => void) => () => void;
};
