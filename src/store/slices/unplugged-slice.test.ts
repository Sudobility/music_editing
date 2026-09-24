import { describe, expect, it } from 'vitest';
import { twinkleScore, twoTrackScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import type { Score } from '@sudobility/music_types';

function makeStore(score: Score = twinkleScore()) {
  const store = testEditingStore();
  store.getState().setScore(score);
  return store;
}

describe('unplugged-slice', () => {
  it('moves the listener, creating the arrangement on first move', () => {
    const store = makeStore();
    store.getState().setUnpluggedListener({ x: 1, z: 2 }, 'Move listener');
    expect(store.getState().score!.unplugged?.listener).toEqual({
      x: 1,
      z: 2,
      facingDeg: 0,
    });
  });

  it('places a track and round-trips through undo', () => {
    const store = makeStore();
    const trackId = store.getState().score!.tracks[0].id;
    const before = store.getState().score;

    store
      .getState()
      .setUnpluggedTrackPosition(trackId, { x: -3, z: 4 }, 'Move instrument');
    expect(store.getState().score!.unplugged?.tracks[trackId]).toEqual({
      x: -3,
      z: 4,
    });

    store.getState().undo();
    expect(store.getState().score).toEqual(before);
  });

  it('is a mix command, so it is not blocked while the transport plays', () => {
    const store = makeStore();
    const trackId = store.getState().score!.tracks[0].id;
    store.setState({ state: 'playing' });

    store
      .getState()
      .setUnpluggedTrackPosition(trackId, { x: 1, z: 1 }, 'Move instrument');
    expect(store.getState().score!.unplugged?.tracks[trackId]).toEqual({
      x: 1,
      z: 1,
    });
  });

  it('resets the arrangement back to the computed default', () => {
    const store = makeStore();
    const trackId = store.getState().score!.tracks[0].id;
    store
      .getState()
      .setUnpluggedTrackPosition(trackId, { x: 1, z: 1 }, 'Move instrument');
    expect(store.getState().score!.unplugged).toBeDefined();

    store.getState().resetUnpluggedArrangement('Reset arrangement');
    expect(store.getState().score!.unplugged).toBeUndefined();
  });

  it('leaves other tracks alone when only one is moved', () => {
    const store = makeStore(twoTrackScore());
    const [first, second] = store.getState().score!.tracks;
    store
      .getState()
      .setUnpluggedTrackPosition(first.id, { x: 1, z: 1 }, 'Move instrument');
    expect(
      store.getState().score!.unplugged?.tracks[second.id]
    ).toBeUndefined();
  });
});

describe('unpluggedActive', () => {
  it('starts false and is not persisted score state', () => {
    const store = makeStore();
    expect(store.getState().unpluggedActive).toBe(false);
  });

  it('toggles without touching the score', () => {
    const store = makeStore();
    const before = store.getState().score;

    store.getState().setUnpluggedActive(true);
    expect(store.getState().unpluggedActive).toBe(true);
    expect(store.getState().score).toEqual(before);

    store.getState().setUnpluggedActive(false);
    expect(store.getState().unpluggedActive).toBe(false);
  });
});
