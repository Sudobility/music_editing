/**
 * The Moosiac editing engine.
 *
 * Everything that changes a score, and the state a change acts on: the four
 * editing slices, the operations over them, note entry, and the selection.
 * It knows nothing about playback, saving, AI generation or templates — those
 * live in `@sudobility/music_lib`, which composes these slices into the web
 * app's single store.
 *
 * The split exists so an editing store can be created PER DOCUMENT. A web app
 * edits one score and a global store is fine; a native app with several
 * documents open needs one store each, and slices written against one global
 * `AppState` cannot give it that.
 */
export * from './store/editing-store.js';
export * from './store/create-editing-store.js';
export * from './store/selectors.js';
export * from './store/slices/score-slice.js';
export * from './store/slices/selection-slice.js';
export * from './store/slices/track-slice.js';
export * from './store/slices/ui-slice.js';
export * from './services/editing/editing.js';
export * from './services/editing/shortcuts.js';
export * from './services/editing/copy.js';
export * from './services/selection/music-selection.js';
export * from './services/selection/singleton.js';
export * from './domain/notation/note-entry.js';
export * from './domain/notation/pitch-drag.js';
