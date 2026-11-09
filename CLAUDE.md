# music_editing

The Moosiac editing engine: an editing store, and every operation that changes
a score — including what a press on the score means (`classifyPress`,
`routeScorePress`) — **and nothing else**. This package is for editing only.
One of the family — see `music_app/docs/architecture.md` for the whole picture.

It knows nothing about playback, saving, documents, export planning, AI
generation, templates, documentation content or device prefs. Those live in
`@sudobility/music_lib`, which composes these slices into the web app's single
application store and re-exports this package whole. Its types and closed
vocabularies are music_types'.

**It depends on neither `music_codecs` nor `music_player`** (`platform-free.test.ts`
rejects both) — editing is not the file-format layer and it is not sound. Its only
package imports are music_types, zustand, immer and react (the one hook,
`use-clipboard-prompts.ts`). It must also run unchanged on web and React Native:
no global RN lacks, no web-only dependency; vitest runs in **node**, not jsdom.
`platform-free.test.ts` greps raw source (comments and string literals stripped)
and names each offending file.

## Why it is a package

The editing code used to live in music_lib, written against one composed
`AppState` (`EditorStoreApi = ReturnType<typeof createAppStore>` was the whole
knot — 80 operations tied to one store). A native app with several documents
open needs one editing store **per document**, which slices naming a single
global state cannot give.

## Commands

- `bun run verify` — format check, typecheck, lint, test, build (before any push)
- `bun run test:unit` / `test:watch` — vitest (node env; ~440 tests). There is
  no `test` script — `bun run test` falls through to `/bin/test` and fails.
- `bun run build` — `tsc -p tsconfig.esm.json` → `dist/` (ESM + d.ts only)

## Boundaries, enforced

- **Editing only, and `src/__moved-out.test.ts` enforces it.** `bindPlayer`,
  `planExport`, docs content (`DOCS_TOPICS`, `RESOURCE_GROUPS`), the unsaved-work
  guard (`decideClose`/`decideQuit`) and `resolveThemeMode` moved to music_lib;
  the lit-keys rule (`litKeys`, `samePitchSet`, `playingPitchesForTrack`) to
  music_drawing; the formats tables, transport/theme/dev vocabularies and every
  closed type (`EditMode`, `ThemeMode`, `Toast`, `ClipboardData`,
  `ScoreCanvasHit`, `ReplaceSubmission`, …) to music_types. `classifyPress` came
  *here* from music_drawing (what a press means is editing). No re-export from an
  old home, ever — music_lib re-exports this and music_types wholesale, so a
  duplicate name is a TS2308 + CommonJS "Cannot redefine property" crash.
- **The ui slice holds no device prefs except `pitchDisplay`.** `themeMode`,
  `developerMode`, `devSettings` are music_lib's; no edit reads them.
  `pitchDisplay` stays because note entry inverts the written-pitch lens.
  `__moved-out.test.ts` fails if any of the six keys is on an editing store.
- **The shortcut list lives here** (`shortcut-table.ts`), beside the bindings it
  is checked against; its row/group vocabulary is music_types'.

## Gotchas

- **A slice is generic over the state it is composed INTO.** `SliceArgs<T extends
  EditingState>` carries a setter, getter and `changed` callback — narrower than
  zustand's `StateCreator`, whose mutator tuple cannot be made generic. So slices
  compose into both the web app's wider store and a bare per-document one.
- **The engine states its requirements rather than importing them.**
  `TransportAwareness` (the edit lock) and `SelectionObservers` are declared here
  and supplied by whoever owns them; `syncModeFromSelection` is optional so a
  document store with no AI generation needs no stub. `TransportState` itself is
  music_types' — the editing slice importing it from the *playback* slice was the
  one dependency pointing the wrong way.
- **The dirty signal is a callback, not an action.** `createEditingStore({
  onChanged })` — a caller never given it cannot fire it, and the type says
  editing informs outward. Saving happens entirely outside this package.
- **A command commit is decided by identity, never by serialising the score.**
  `persistedScoreChanged` walks top-level and per-track fields by identity
  (skipping `muted`/`solo`); `issuesFor` returns the previous `validationIssues`
  by identity when nothing the validator reads changed. This replaced a
  double `JSON.stringify` + unconditional `validateScore` that cost ~57 ms per
  listener/map-drag frame on a 20-track × 500-bar score (now 0.04 ms). A mute
  still dirties the project (it stamps `metadata`); a test pins the exclusion.
- **Writes read the edit mode in effect, never the stored one.**
  `selectEffectiveEditMode` answers `replace` for a stored `stack` on a part that
  cannot play a chord; chord entry and `paste` both read it, leaving the stored
  choice alone. Neither app writes the effective mode back any more.
- **Inspector note writes return whether the score changed.** `changeVelocity`,
  `setFingering`, `setNotePitch` return `boolean` like `setTimeSignature` and skip
  a value every target already has, so a blur-committed non-edit is no undo entry;
  a write the playback lock refused reports `false`.
- **`pitch-drag` takes pixels-per-staff-position as a parameter.** Importing
  `STAVE_POSITION_HEIGHT` from music_drawing would drag VexFlow into a native app
  that draws with something else; the caller knows how tall a staff position is.
- **A test builds a store with no backend, no DOM, no transport** —
  `testEditingStore()` in `src/test/store.ts`.
