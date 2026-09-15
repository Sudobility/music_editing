import { beforeEach, describe, expect, it } from 'vitest';
import { twinkleScore, twoTrackScore } from '@sudobility/music_types/test';
import {
  allNotes,
  getMusicPosition,
  getMusicPositionSource,
  resetMusicPosition,
} from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import {
  applyBoxSelection,
  classifyPointerDown,
  routeScorePress,
  selectForContextMenu,
  startPointerGesture,
} from './score-press.js';
import type { ScorePressModifiers } from './score-press.js';

const plain: ScorePressModifiers = {
  shift: false,
  mod: false,
  noteInput: false,
  pitchDisplay: 'concert',
  anchor: null,
  pointTick: null,
};

function twoTracks() {
  const store = testEditingStore(twoTrackScore());
  return { store, score: store.getState().score! };
}

beforeEach(() => {
  resetMusicPosition();
});

describe('routeScorePress', () => {
  it('a track gutter press activates and selects the track, leaving the caret', () => {
    const { store, score } = twoTracks();
    const second = score.tracks[1]!;
    getMusicPositionSource().moveTo(480);

    routeScorePress(store, { kind: 'trackGutter', trackId: second.id }, plain);

    expect(store.getState().activeTrackId).toBe(second.id);
    expect(store.getState().selection.trackIds).toEqual([second.id]);
    expect(getMusicPosition().reportedTick).toBe(480);
  });

  it('a bar-number press selects the bar on the active track and answers the anchor', () => {
    const { store, score } = twoTracks();
    const next = routeScorePress(
      store,
      { kind: 'measureNumber', measureIndex: 1 },
      plain
    );
    expect(next).toBe(1);
    expect(store.getState().selection.measureIds).toEqual([
      score.tracks[0]!.measures[1]!.id,
    ]);
  });

  it('shift extends a bar span from the anchor', () => {
    const { store, score } = twoTracks();
    const next = routeScorePress(
      store,
      { kind: 'measureNumber', measureIndex: 2 },
      { ...plain, shift: true, anchor: 0 }
    );
    expect(next).toBe(0);
    expect(store.getState().selection.measureIds).toEqual(
      score.tracks[0]!.measures.slice(0, 3).map(m => m.id)
    );
  });

  it('mod+shift on a bar number selects that bar on every track, not a span', () => {
    const { store, score } = twoTracks();
    routeScorePress(
      store,
      { kind: 'measureNumber', measureIndex: 2 },
      { ...plain, shift: true, mod: true, anchor: 0 }
    );
    expect(store.getState().selection.measureIds).toEqual(
      score.tracks.map(t => t.measures[2]!.id)
    );
  });

  it('mod selects from the caret to the pressed tick without moving the caret', () => {
    const { store, score } = twoTracks();
    const notes = allNotes(score).filter(
      n => n.trackId === score.tracks[0]!.id
    );
    const target = notes[2]!;

    routeScorePress(
      store,
      {
        kind: 'stave',
        trackId: target.trackId,
        tick: target.startTick + 1,
        pitch: null,
      },
      { ...plain, mod: true, pointTick: target.startTick + 1 }
    );

    expect(store.getState().selection.range?.endTick).toBe(
      target.startTick + 1
    );
    expect(store.getState().selection.eventIds).toContain(notes[0]!.id);
    expect(getMusicPosition().reportedTick).toBe(0);
  });

  it('mod reads the tick the canvas reports for the point, not the hit', () => {
    // The hit's tick is the canvas's best guess *inside a measure*, and is 0
    // where it has none; a press between systems has no hit at all. The web
    // always asked the canvas's tickAt instead, which is what makes a
    // cmd-click on an empty stretch of page do something.
    const { store } = twoTracks();
    routeScorePress(store, null, { ...plain, mod: true, pointTick: 960 });
    expect(store.getState().selection.range?.endTick).toBe(960);

    routeScorePress(
      store,
      { kind: 'stave', trackId: 'x', tick: 0, pitch: null },
      { ...plain, mod: true, pointTick: 1440 }
    );
    expect(store.getState().selection.range?.endTick).toBe(1440);
  });

  it('mod with no tick under the point does nothing', () => {
    const { store } = twoTracks();
    routeScorePress(store, null, { ...plain, mod: true, pointTick: null });
    expect(store.getState().selection.range).toBeUndefined();
  });

  it('a note press selects the chord and aims the caret at it', () => {
    const { store, score } = twoTracks();
    const note = allNotes(score)[3]!;

    routeScorePress(
      store,
      {
        kind: 'note',
        eventIds: [note.id],
        trackId: note.trackId,
        tick: note.startTick,
      },
      plain
    );

    expect(store.getState().selection.eventIds).toEqual([note.id]);
    expect(getMusicPosition().reportedTick).toBe(note.startTick);
  });

  it('shift on a note toggles the last id of the box and leaves the caret', () => {
    const { store, score } = twoTracks();
    const [a, b] = allNotes(score);
    store.getState().setSelection({
      eventIds: [a!.id],
      measureIds: [],
      trackIds: [],
    });
    getMusicPositionSource().moveTo(7);

    routeScorePress(
      store,
      { kind: 'note', eventIds: [b!.id], trackId: b!.trackId, tick: 0 },
      { ...plain, shift: true }
    );

    expect(store.getState().selection.eventIds).toEqual([a!.id, b!.id]);
    expect(getMusicPosition().reportedTick).toBe(7);
  });

  it('with note input on, a stave press writes the sounding pitch at the point', () => {
    const store = testEditingStore(twinkleScore());
    const score = store.getState().score!;
    const track = score.tracks[0]!;
    // A pitch the fixture never uses, so only the write can have put it there.
    const last = track.measures[track.measures.length - 1]!;

    routeScorePress(
      store,
      {
        kind: 'stave',
        trackId: track.id,
        tick: last.startTick,
        pitch: { step: 'B', accidental: -1, octave: 5 },
      },
      { ...plain, noteInput: true }
    );

    const written = allNotes(store.getState().score!).filter(
      n => n.startTick === last.startTick && n.trackId === track.id
    );
    expect(
      written.some(
        n =>
          n.pitch.step === 'B' &&
          n.pitch.accidental === -1 &&
          n.pitch.octave === 5
      )
    ).toBe(true);
  });

  it('without note input, a stave press places the caret and clears the selection', () => {
    const { store, score } = twoTracks();
    const second = score.tracks[1]!;
    store.getState().selectTrack(score.tracks[0]!.id);

    routeScorePress(
      store,
      {
        kind: 'stave',
        trackId: second.id,
        tick: 960,
        pitch: { step: 'E', accidental: 0, octave: 4 },
      },
      plain
    );

    expect(getMusicPosition().reportedTick).toBe(960);
    expect(store.getState().activeTrackId).toBe(second.id);
    expect(store.getState().selection.trackIds).toEqual([]);
  });

  it('a press on nothing does nothing and keeps the anchor', () => {
    const { store } = twoTracks();
    expect(routeScorePress(store, null, { ...plain, anchor: 4 })).toBe(4);
  });
});

describe('selectForContextMenu', () => {
  it('keeps a bar selection the press lands inside', () => {
    const { store, score } = twoTracks();
    const ids = score.tracks[0]!.measures.slice(0, 3).map(m => m.id);
    store.getState().selectMeasures(ids);

    const anchor = selectForContextMenu(
      store,
      { kind: 'measureNumber', measureIndex: 1 },
      0
    );

    expect(store.getState().selection.measureIds).toEqual(ids);
    expect(anchor).toBe(0);
  });

  it('narrows to the pressed bar when it is outside the selection', () => {
    const { store, score } = twoTracks();
    store.getState().selectMeasures([score.tracks[0]!.measures[0]!.id]);
    const anchor = selectForContextMenu(
      store,
      { kind: 'measureNumber', measureIndex: 3 },
      0
    );
    expect(store.getState().selection.measureIds).toEqual([
      score.tracks[0]!.measures[3]!.id,
    ]);
    expect(anchor).toBe(3);
  });

  it('keeps a note selection when any note of the pressed chord is in it', () => {
    const { store, score } = twoTracks();
    const [a, b] = allNotes(score);
    store.getState().setSelection({
      eventIds: [a!.id, b!.id],
      measureIds: [],
      trackIds: [],
    });
    selectForContextMenu(
      store,
      { kind: 'note', eventIds: [b!.id], trackId: b!.trackId, tick: 0 },
      null
    );
    expect(store.getState().selection.eventIds).toEqual([a!.id, b!.id]);
  });

  it('selects a pressed note, or track, outside the selection', () => {
    const { store, score } = twoTracks();
    const note = allNotes(score)[4]!;
    selectForContextMenu(
      store,
      { kind: 'note', eventIds: [note.id], trackId: note.trackId, tick: 0 },
      null
    );
    expect(store.getState().selection.eventIds).toEqual([note.id]);

    const second = score.tracks[1]!;
    selectForContextMenu(
      store,
      { kind: 'trackGutter', trackId: second.id },
      null
    );
    expect(store.getState().selection.trackIds).toEqual([second.id]);
    expect(store.getState().activeTrackId).toBe(second.id);
  });

  it('leaves the selection alone on a bare stave', () => {
    const { store, score } = twoTracks();
    const note = allNotes(score)[0]!;
    store.getState().setSelection({
      eventIds: [note.id],
      measureIds: [],
      trackIds: [],
    });
    selectForContextMenu(
      store,
      { kind: 'stave', trackId: note.trackId, tick: 960, pitch: null },
      null
    );
    expect(store.getState().selection.eventIds).toEqual([note.id]);
  });
});

describe('classifyPointerDown', () => {
  it('Alt on a note is a move anchored on the last id of the box', () => {
    const { store, score } = twoTracks();
    const [a, b] = allNotes(score);
    const gesture = classifyPointerDown(
      store.getState(),
      {
        kind: 'note',
        eventIds: [a!.id, b!.id],
        trackId: a!.trackId,
        tick: 0,
      },
      { alt: true, shift: false }
    );
    expect(gesture).toEqual({
      kind: 'move',
      anchorId: b!.id,
      anchorTick: b!.startTick,
      selectChord: [a!.id, b!.id],
    });
  });

  it('a move on an already-selected note keeps the selection', () => {
    const { store, score } = twoTracks();
    const [a, b] = allNotes(score);
    store.getState().setSelection({
      eventIds: [a!.id, b!.id],
      measureIds: [],
      trackIds: [],
    });
    const gesture = classifyPointerDown(
      store.getState(),
      { kind: 'note', eventIds: [b!.id], trackId: b!.trackId, tick: 0 },
      { alt: true, shift: false }
    );
    expect(gesture).toMatchObject({ kind: 'move', selectChord: null });
  });

  it('a press on the one selected note is a pitch drag', () => {
    const { store, score } = twoTracks();
    const note = allNotes(score)[1]!;
    store.getState().setSelection({
      eventIds: [note.id],
      measureIds: [],
      trackIds: [],
    });
    const gesture = classifyPointerDown(
      store.getState(),
      { kind: 'note', eventIds: [note.id], trackId: note.trackId, tick: 0 },
      { alt: false, shift: false }
    );
    expect(gesture).toEqual({
      kind: 'pitchDrag',
      eventId: note.id,
      pitch: note.pitch,
    });
  });

  it('anything else is a box select, additive with shift', () => {
    const { store, score } = twoTracks();
    const note = allNotes(score)[1]!;
    expect(
      classifyPointerDown(
        store.getState(),
        { kind: 'note', eventIds: [note.id], trackId: note.trackId, tick: 0 },
        { alt: false, shift: true }
      )
    ).toEqual({ kind: 'box', additive: true });
    expect(
      classifyPointerDown(store.getState(), null, { alt: true, shift: false })
    ).toEqual({ kind: 'box', additive: false });
  });
});

describe('startPointerGesture', () => {
  it('selects the chord when a move starts off the selection, and nothing else', () => {
    // A move is about which notes, like a box: the web never aimed the caret or
    // switched the active track on an Option-press, and doing so would yank
    // the playhead to wherever a drag happened to start.
    const { store, score } = twoTracks();
    const note = allNotes(score).find(
      n => n.trackId === score.tracks[1]!.id && n.startTick > 0
    )!;
    getMusicPositionSource().moveTo(0);
    const activeBefore = store.getState().activeTrackId;
    const gesture = startPointerGesture(
      store,
      { kind: 'note', eventIds: [note.id], trackId: note.trackId, tick: 0 },
      { alt: true, shift: false }
    );
    expect(gesture.kind).toBe('move');
    expect(store.getState().selection.eventIds).toEqual([note.id]);
    expect(getMusicPosition().reportedTick).toBe(0);
    expect(store.getState().activeTrackId).toBe(activeBefore);
  });
});

describe('applyBoxSelection', () => {
  it('replaces, or adds to, the selection', () => {
    const { store, score } = twoTracks();
    const [a, b, c] = allNotes(score);
    applyBoxSelection(store, [a!.id], false);
    applyBoxSelection(store, [b!.id, a!.id], true);
    expect(store.getState().selection.eventIds).toEqual([a!.id, b!.id]);
    applyBoxSelection(store, [c!.id], false);
    expect(store.getState().selection.eventIds).toEqual([c!.id]);
  });
});
