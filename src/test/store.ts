/**
 * A store for a test, built the way a document is.
 *
 * Notice what is missing: no injected context. The editing store needs no
 * network client, no token and no storage, because editing does not do any of
 * those things — the tests used to construct the whole application store with
 * a faked backend just to press a key. That they no longer have to is the
 * clearest evidence the split landed where it should have.
 */
import { createEditingStore } from '../store/create-editing-store.js';
import type { EditingStore } from '../store/create-editing-store.js';
import type { Score, TransportState } from '@sudobility/music_types';

export type TestEditingStore = EditingStore & {
  /** How many times an edit reported that something changed. */
  dirtyCount: () => number;
  /** Move the transport, which the edit lock reads. */
  setTransport: (state: TransportState) => void;
};

export function testEditingStore(score?: Score): TestEditingStore {
  let dirty = 0;
  const store = createEditingStore({ onChanged: () => (dirty += 1) });
  if (score) store.getState().setScore(score);
  return Object.assign(store, {
    dirtyCount: () => dirty,
    setTransport: (state: TransportState) =>
      store.setState(draft => {
        draft.state = state;
      }),
  });
}
