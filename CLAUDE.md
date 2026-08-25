# music_editing

The Moosiac editing engine: an editing store, and every operation that changes
a score. One of the family — see `music_app/docs/architecture.md` for the whole
picture.

It knows nothing about playback, saving, AI generation or templates. Those live
in `@sudobility/music_lib`, which composes these slices into the web app's
single application store and re-exports this package whole, so an existing
`@sudobility/music_lib` import still resolves.

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

## Gotchas

- **A slice is generic over the state it is composed INTO.** `SliceArgs<T extends EditingState>` carries a setter, a getter and a `changed` callback — deliberately narrower than zustand's `StateCreator`, whose mutator tuple `[['zustand/immer', never]]` cannot be made generic because it has to name a concrete state. The slices take the three things they actually use, and stay composable into both the web app's wider store and a bare per-document one.
- **The engine states its requirements rather than importing them.** `TransportAwareness` (the edit lock refuses content changes while the transport plays) and `SelectionObservers` are declared here and supplied by whoever owns those things. `syncModeFromSelection` is **optional** on purpose: a document store with no AI generation in it should not have to supply a stub to say so. `TransportState` itself moved to music_types — the editing slice importing it from the *playback* slice was the one dependency pointing the wrong way, and three words were never playback logic.
- **The dirty signal is a callback, not an action on the state.** `createEditingStore({ onChanged })`. It was a `markDirty` field, which made it a shared mutable action anything holding the store could fire; a callback cannot be fired by a caller that was never given it, and it makes the direction unmistakable in the type — editing informs outward, nothing flows back. **Saving happens entirely outside this package.** The web app points it at its autosaver; a native app can point it at a file write, a dirty marker in a tab bar, or nothing.
- **It must run unchanged on the web and on React Native, and `platform-free.test.ts` enforces that.** No global React Native lacks, no import beyond music_types/zustand/immer, no web-only package dependency — each failure names the file. The claim is easy to make and easy to break: one `document.` and a native build fails at runtime, long after the commit that caused it. Vitest runs in a **node** environment rather than jsdom for the same reason — if any of this needed a DOM the tests would fail, rather than quietly passing on a DOM that React Native will not provide. The guard strips comments *and string literals* before matching, because a test named `'gives each document its own history'` is prose about the word, and a guard that cries wolf gets deleted.
- **`pitch-drag` takes pixels-per-staff-position as a parameter.** It imported `STAVE_POSITION_HEIGHT` from music_drawing, and that one import would have dragged VexFlow into a native app that draws with something else. How tall a staff position is on screen is the renderer's fact, and the caller knows it.
- **A test builds a store with no backend context, no DOM and no transport.** `testEditingStore()` in `src/test/store.ts`. That the moved tests no longer construct the whole application store with a faked network client just to press a key is the clearest evidence the split landed where it should have.
