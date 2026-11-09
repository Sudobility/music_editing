# @sudobility/music_editing

The Moosiac editing engine: an editing store and **every operation that changes
a score** — note entry, selection, copy/paste, the inspector, toolbar, shortcuts,
and what a press on the score means (`classifyPress`, `routeScorePress`) — **and
nothing else**.

It is a TypeScript library (ESM only) built on [zustand](https://github.com/pmndrs/zustand)
+ [immer](https://immerjs.github.io/immer/). It runs **unchanged on web and
React Native**: it touches no DOM, needs no network, token or storage, and
depends on no web-only or RN-only global.

One of a family of packages. This one edits; it knows nothing about playback,
saving, documents, export, AI generation, templates, docs content or device
prefs. Those live in `@sudobility/music_lib`, which composes these slices into
the web app's single application store and re-exports this package whole. All
types and closed vocabularies come from `@sudobility/music_types`.

## Why it exists

The editing code used to live inside `music_lib`, written against one composed
`AppState`. That ties ~80 operations to a single global store. A native app with
several documents open needs **one editing store per document**, which a global
store cannot give. This package provides the slices and operations in a form
that composes into both: a bare per-document store, and the web app's wider one.

## Install

Published to **GitHub Packages** under the `@sudobility` scope (private,
BUSL-1.1), so your environment needs the registry and a read token configured.
`.npmrc` in this repo already points the scope at the registry:

```
@sudobility:registry=https://npm.pkg.github.com
```

Consumers also need a token with `read:packages` (e.g. `GH_PACKAGES_READ_TOKEN`).
Then:

```sh
bun add @sudobility/music_editing
```

### Peer dependencies

Provided by the consuming app, not bundled here:

- `@sudobility/music_types` `^0.13.65`
- `immer` `^11.1.18`
- `react` `>=18`
- `zustand` `>=5`

## Develop

Uses [Bun](https://bun.sh) as the package manager. Node is used to run the
toolchain.

```sh
bun install
```

| Command | What it does |
| --- | --- |
| `bun run build` | Compile ESM + types to `dist/` (`tsc -p tsconfig.esm.json`) |
| `bun run test:unit` | Run the vitest suite once |
| `bun run test:watch` | Run vitest in watch mode |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint over `src` |
| `bun run format` / `format:check` | Prettier write / check |
| `bun run verify` | format:check + typecheck + lint + test:unit + build — run before every push |
| `bun run clean` | Remove `dist/` |

Tests run in **node**, not jsdom (the engine touches no DOM). `vitest run`
reports ~440 tests across ~30 files.

## Usage

Create one store per document and pass an `onChanged` callback — that callback
is the entire interface between editing and saving; saving happens on your side
of it.

```ts
import { createEditingStore } from '@sudobility/music_editing';

const store = createEditingStore({
  onChanged: () => markDocumentDirty(), // your autosave / dirty flag
});

store.getState().setScore(score);
// ...run editing operations against the store
```

Within this repo, tests build a store with no backend, DOM or transport via the
`testEditingStore()` helper in `src/test/store.ts`.

The entry point (`src/index.ts`) re-exports the store factory, the five slices
(`score`, `selection`, `track`, `ui`, `unplugged`), selectors, every editing
operation, note entry, pitch drag, the selection services, and the
reader-facing shortcut table.

## Architecture

- **Slices are generic over the state they compose into** (`SliceArgs<T extends
  EditingState>`), so the same slices build both a bare per-document store and
  the web app's wider store.
- **The engine declares its requirements rather than importing them.** The edit
  lock (`TransportAwareness`) and `SelectionObservers` are supplied by whoever
  owns them; `TransportState` itself comes from `music_types`.
- **Boundaries are test-enforced.** `src/platform-free.test.ts` rejects any
  import of `music_codecs` or `music_player` and any web-/RN-only global;
  `src/__moved-out.test.ts` fails if code that belongs in `music_lib`,
  `music_drawing` or `music_types` reappears here.

See `CLAUDE.md` for the full set of conventions and gotchas, and
`music_app/docs/architecture.md` for the whole family.

## License

BUSL-1.1. Private / restricted publish access.
