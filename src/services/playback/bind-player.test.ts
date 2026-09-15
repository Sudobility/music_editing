import { afterEach, describe, expect, it, vi } from 'vitest';
import { twoTrackScore } from '@sudobility/music_types/test';
import {
  getMusicPosition,
  getMusicPositionSource,
  resetMusicPosition,
  scoreEndTick,
} from '@sudobility/music_types';
import type {
  PlaybackLoadState,
  ScoreRange,
  TransportPlaybackState,
} from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import { bindPlayer } from './bind-player.js';
import type { BindablePlayer } from './bind-player.js';

type Fake = BindablePlayer & {
  emitTransport: (state: TransportPlaybackState) => void;
  emitLoad: (state: PlaybackLoadState) => void;
  calls: Record<string, unknown[][]>;
};

function fakePlayer(overrides: Partial<BindablePlayer> = {}): Fake {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
    };
  let transport: ((s: TransportPlaybackState) => void) | null = null;
  let load: ((s: PlaybackLoadState) => void) | null = null;
  const player: Fake = {
    load: vi.fn(async (...args: unknown[]) => record('load')(...args)),
    play: vi.fn(async () => record('play')()),
    pause: record('pause'),
    stop: record('stop'),
    setLoop: record('setLoop') as (r: ScoreRange | null) => void,
    setTempoMultiplier: record('setTempoMultiplier'),
    setMetronome: record('setMetronome'),
    setMasterVolume: record('setMasterVolume'),
    setVisibleTracks: record('setVisibleTracks'),
    onTransport: fn => {
      transport = fn;
      return () => (transport = null);
    },
    onLoadState: fn => {
      load = fn;
      return () => (load = null);
    },
    ...overrides,
    emitTransport: s => transport?.(s),
    emitLoad: s => load?.(s),
    calls,
  };
  return player;
}

afterEach(() => resetMusicPosition());

describe('bindPlayer', () => {
  it('loads the score it is bound to, and each new score after', () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    bindPlayer(player, store);
    expect(player.calls.load).toHaveLength(1);
    expect(player.calls.load![0]![0]).toBe(store.getState().score);

    store.getState().setScore(twoTrackScore());
    expect(player.calls.load).toHaveLength(2);
  });

  it('mirrors the transport and the synth load into the store', () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    bindPlayer(player, store);
    player.emitTransport('playing');
    expect(store.getState().state).toBe('playing');
    player.emitLoad({ status: 'loading', fraction: 0.5 });
    expect(store.getState().synthLoad).toEqual({
      status: 'loading',
      fraction: 0.5,
    });
  });

  it('pushes visible tracks without reloading', () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    bindPlayer(player, store);
    const [first] = store.getState().score!.tracks;
    store.getState().setVisibleTracks([first!.id]);
    expect(player.calls.setVisibleTracks).toEqual([[[first!.id]]]);
    expect(player.calls.load).toHaveLength(1);
  });

  it('clears the selection on play, and pauses when already playing', async () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    const binding = bindPlayer(player, store);
    const [first] = store.getState().score!.tracks;
    store.getState().selectTrack(first!.id);

    await binding.togglePlay();
    expect(player.calls.play).toHaveLength(1);
    expect(store.getState().selection.trackIds).toEqual([]);

    store.getState().selectTrack(first!.id);
    player.emitTransport('playing');
    await binding.togglePlay();
    expect(player.calls.pause).toHaveLength(1);
    // Pausing to edit keeps what was selected.
    expect(store.getState().selection.trackIds).toEqual([first!.id]);
  });

  it('reports a failure to play or load through the error hook', async () => {
    const store = testEditingStore(twoTrackScore());
    const onError = vi.fn();
    const failure = new Error('no synth');
    const binding = bindPlayer(
      fakePlayer({
        play: async () => {
          throw failure;
        },
        load: async () => {
          throw failure;
        },
      }),
      store,
      { onError }
    );
    await Promise.resolve();
    await binding.togglePlay();
    expect(onError).toHaveBeenCalledWith('scoreLoadFailed', failure);
    expect(onError).toHaveBeenCalledWith('playbackFailed', failure);
  });

  it('loops the selection, else the whole score, and a second press clears', () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    const binding = bindPlayer(player, store);
    const score = store.getState().score!;

    binding.toggleLoop();
    expect(store.getState().loopRange).toEqual({
      startTick: 0,
      endTick: scoreEndTick(score),
      trackIds: [],
    });
    expect(player.calls.setLoop).toHaveLength(1);

    binding.toggleLoop();
    expect(store.getState().loopRange).toBeNull();

    const bar2 = score.tracks[0]!.measures[1]!;
    store.getState().selectMeasures([bar2.id]);
    binding.toggleLoop();
    expect(store.getState().loopRange?.startTick).toBe(bar2.startTick);
  });

  it('steps a bar at a time, clamped at both ends', () => {
    const store = testEditingStore(twoTrackScore());
    const binding = bindPlayer(fakePlayer(), store);
    const measures = store.getState().score!.tracks[0]!.measures;

    binding.nextMeasure();
    expect(getMusicPosition().reportedTick).toBe(measures[1]!.startTick);
    binding.previousMeasure();
    binding.previousMeasure();
    expect(getMusicPosition().reportedTick).toBe(0);

    getMusicPositionSource().moveTo(measures.at(-1)!.startTick);
    binding.nextMeasure();
    expect(getMusicPosition().reportedTick).toBe(measures.at(-1)!.startTick);

    binding.seek(-5);
    expect(getMusicPosition().reportedTick).toBe(0);
  });

  it('keeps speed, metronome and volume in the store as well as the player', () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    const binding = bindPlayer(player, store);
    binding.setTempoMultiplier(1.5);
    binding.setMetronome(true);
    binding.setMasterVolume(0.25);
    expect(store.getState()).toMatchObject({
      tempoMultiplier: 1.5,
      metronome: true,
      masterVolume: 0.25,
    });
    expect(player.calls.setTempoMultiplier).toEqual([[1.5]]);
  });

  it('stops listening once unbound, and leaves the player alive', () => {
    const store = testEditingStore(twoTrackScore());
    const player = fakePlayer();
    const binding = bindPlayer(player, store);
    binding.unbind();
    player.emitTransport('playing');
    store.getState().setScore(twoTrackScore());
    expect(store.getState().state).toBe('stopped');
    expect(player.calls.load).toHaveLength(1);
  });
});
