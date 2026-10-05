/**
 * The Moosiac editing engine.
 *
 * Everything that changes a score, and the state a change acts on: the four
 * editing slices, the operations over them, note entry, and the selection.
 * It knows nothing about playback, saving, AI generation, templates, export
 * planning, documentation or device prefs — those live in
 * `@sudobility/music_lib`, which composes these slices into the web app's
 * single store. Its vocabulary and types live in `@sudobility/music_types`.
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
export * from './store/slices/unplugged-slice.js';
export * from './services/editing/editing.js';
export * from './services/editing/line-drawing.js';
export * from './services/editing/key-group.js';
export * from './services/editing/shortcuts.js';
export * from './services/editing/copy.js';
export * from './services/editing/range-refusal.js';
export * from './services/editing/score-press.js';
export * from './services/editing/press.js';
export * from './services/editing/context-menu.js';
export * from './services/editing/inspector.js';
export * from './services/editing/toolbar.js';
export * from './services/editing/lyric-entry.js';
export * from './services/editing/transport-fields.js';
export * from './services/editing/selection-kind.js';
export * from './services/editing/view-settings.js';
export * from './services/editing/use-clipboard-prompts.js';
export * from './services/selection/music-selection.js';
export * from './services/selection/singleton.js';
export * from './domain/notation/note-entry.js';
export * from './domain/notation/pitch-drag.js';

/** The shortcut list a reader is shown, checked against the bindings. */
export * from './services/editing/shortcut-table.js';
