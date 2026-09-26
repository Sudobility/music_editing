# music_editing

The Moosiac editing engine: an editing store, and every operation that changes
a score — including what a press on the score means (`classifyPress`,
`routeScorePress`) — **and nothing else**. This package is for editing only. One
of the family — see `music_app/docs/architecture.md` for the whole picture.

It knows nothing about playback, saving, documents, export planning, AI
generation, templates, documentation content or device prefs. Those live in
`@sudobility/music_lib`, which composes these slices into the web app's single
application store and re-exports this package whole, so an existing
`@sudobility/music_lib` import still resolves. Its types and closed
vocabularies are music_types'. **It depends on neither `music_codecs` nor
`music_player`**: its only package imports are music_types, zustand, immer and
react (for the one hook, `use-clipboard-prompts.ts`).

## Why it is a package

The editing code used to live in music_lib, written against one composed
`AppState`. That made it impossible to lift out and, more importantly,
impossible to have **two of**: a native app with several documents open needs
one editing store per document, and slices that name a single global state
cannot give it that.

`EditorStoreApi = ReturnType<typeof createAppStore>` was the whole knot — one
line tying all 80 operations to one store.

## Commands

- `bun run verify` — format check, typecheck, lint, test, build (run before any push)
- `bun run test` / `bun run test:watch` — vitest

## What left, and what came

- **Editing only, and `src/__moved-out.test.ts` enforces it.** The player
  binding (`bindPlayer`, now in music_lib's `services/playback/bind-player.ts`),
  export planning (`planExport`, `services/export/export-plan.ts`), the
  documentation content (`DOCS_TOPICS`, `RESOURCE_GROUPS`, `services/docs/`), the
  unsaved-work guard (`decideClose`/`decideQuit`,
  `services/documents/unsaved-guard.ts`) and `resolveThemeMode` (`prefs.ts`)
  moved to music_lib; the
  lit-keys rule (`litKeys`, `samePitchSet`, `playingPitchesForTrack`) moved to
  music_drawing beside the keyboard (`playing-pitches.ts`); the formats table
  (`IMPORT_FORMATS`/`EXPORT_FORMATS`), `WRITABLE_EXPORT_FORMATS`,
  `TransportSettings`, `THEME_MODES`/`DevSettings` and every other closed
  vocabulary and shared type — `EditMode`, `ThemeMode`, `Toast`,
  `ClipboardData`, `ScoreCanvasHit` (which replaced this package's structural
  `ScoreHit`), `EditingCopy`, the inspector/toolbar/context-menu/shortcut
  vocabularies, `ReplaceSubmission` and the rest — moved to music_types, which
  this package imports them from. `classifyPress` and its slops came *here* from
  music_drawing (`services/editing/press.ts`), beside `score-press.ts`: what a
  press means is editing. music_lib re-exports this package and music_types
  wholesale, so a name exported from both is a TS2308 and a CommonJS "Cannot
  redefine property" crash — no re-export from an old home, ever.
- **The ui slice holds no device prefs except `pitchDisplay`.** `themeMode`,
  `developerMode` and `devSettings` (and their setters) are music_lib's
  device-prefs slice: no edit reads them. `pitchDisplay` stays because note
  entry inverts the written-pitch lens; `mirrorDevicePrefs` copies only it into
  a document store. `__moved-out.test.ts` builds an editing store and fails if
  any of those six keys is on it.
- **The shortcut list lives here** (`shortcut-table.ts`), beside the bindings it
  is checked against; its row and group vocabulary is music_types'.

## Gotchas

- **A slice is generic over the state it is composed INTO.** `SliceArgs<T extends EditingState>` carries a setter, a getter and a `changed` callback — deliberately narrower than zustand's `StateCreator`, whose mutator tuple `[['zustand/immer', never]]` cannot be made generic because it has to name a concrete state. The slices take the three things they actually use, and stay composable into both the web app's wider store and a bare per-document one.
- **The engine states its requirements rather than importing them.** `TransportAwareness` (the edit lock refuses content changes while the transport plays) and `SelectionObservers` are declared here and supplied by whoever owns those things. `syncModeFromSelection` is **optional** on purpose: a document store with no AI generation in it should not have to supply a stub to say so. `TransportState` itself moved to music_types — the editing slice importing it from the *playback* slice was the one dependency pointing the wrong way, and three words were never playback logic.
- **The dirty signal is a callback, not an action on the state.** `createEditingStore({ onChanged })`. It was a `markDirty` field, which made it a shared mutable action anything holding the store could fire; a callback cannot be fired by a caller that was never given it, and it makes the direction unmistakable in the type — editing informs outward, nothing flows back. **Saving happens entirely outside this package.** The web app points it at its autosaver; a native app can point it at a file write, a dirty marker in a tab bar, or nothing.
- **A command commit is decided by identity, never by serialising the score.** `dispatchCommand`/`undo`/`redo` used to answer "did this change anything the server keeps" by `JSON.stringify`ing both scores — the whole score, twice — and re-ran `validateScore` unconditionally. A listener step on the Unplugged stage or a frame of a map drag is a command, once per animation frame, so on a 20-track × 500-bar score that was **18 ms of serialisation + 39 ms of validation per frame** to learn that `score.unplugged` moved. `persistedScoreChanged` walks the top-level fields and each track's fields by identity (skipping `muted`/`solo`, the listening preferences), which is sound because commands are pure and the store freezes what it holds; and `issuesFor` returns the previous `validationIssues` **by identity** when `tracks`, `tempoMap` and `id` — everything the validator reads — kept theirs, so a host subscribed to the issues does not render for the move. Measured after: **0.04 ms** per listener command on the same score. A mute command still dirties the project, because it also stamps `metadata`; the exclusion is about the comparison, and a test pins that.
- **It must run unchanged on the web and on React Native, and `platform-free.test.ts` enforces that.** No global React Native lacks, no import beyond music_types/zustand/immer/react, no web-only package dependency — each failure names the file. The claim is easy to make and easy to break: one `document.` and a native build fails at runtime, long after the commit that caused it. Vitest runs in a **node** environment rather than jsdom for the same reason — if any of this needed a DOM the tests would fail, rather than quietly passing on a DOM that React Native will not provide. The guard strips comments *and string literals* before matching, because a test named `'gives each document its own history'` is prose about the word, and a guard that cries wolf gets deleted.
- **Writes read the edit mode in effect, never the stored one.** `selectEffectiveEditMode` (in `selectors.ts`) answers `replace` for a stored `stack` on a part that cannot play a chord, and chord entry and `paste` both read it. The stored choice is left alone, so a piano gets stack back. Both apps used to write the effective mode back into the store from an effect because these paths read `state.editMode`; nothing needs that now. The polyphony refusal in `insertChordAtCaret` counts only the notes the write **leaves** at the tick (all of them for stack, other voices for replace, none for insert, which pushes the track out of the way) — counting every note there refused a single note typed over another on a flute in any mode.
- **This package depends on neither `music_codecs` nor `music_player`.** Editing is not the file-format layer, and it is not sound. The formats tables that name the project file (`WRITABLE_EXPORT_FORMATS`, `IMPORT_FORMATS`) were the reason it once imported music_codecs, for `DOCUMENT_EXTENSION(S)`; the tables and the constant are all music_types' now and nothing here reads them, while the parser and serializer stay in music_codecs. `platform-free.test.ts` rejects a music_codecs import and a music_player import alike ("depends on neither music_codecs nor music_player"): binding a player is not editing, which is why `bindPlayer` moved to music_lib and takes `IMusicPlayer` there, rather than typing the player structurally here. (music_codecs was allowed briefly for that one constant; the constant moved instead.)
- **The inspector's note writes return whether the score changed.** `changeVelocity`, `setFingering` and `setNotePitch` return `boolean` like `setTimeSignature`, and skip a value every target already has, so a field committed on blur without an edit is not an undo entry. "Changed" is measured as score identity after the dispatch, which also makes a write the playback lock refused report `false`.
- **`pitch-drag` takes pixels-per-staff-position as a parameter.** It imported `STAVE_POSITION_HEIGHT` from music_drawing, and that one import would have dragged VexFlow into a native app that draws with something else. How tall a staff position is on screen is the renderer's fact, and the caller knows it.
- **A test builds a store with no backend context, no DOM and no transport.** `testEditingStore()` in `src/test/store.ts`. That the moved tests no longer construct the whole application store with a faked network client just to press a key is the clearest evidence the split landed where it should have.
