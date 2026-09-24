import { describe, expect, it } from 'vitest';
import { twinkleScore, twoTrackScore } from '@sudobility/music_types/test';
import {
  CLEFS,
  INHERIT_CLEF,
  MAX_TIME_SIG_NUMERATOR,
  allNotes,
  changeMeasureClefCommand,
  changeTempoCommand,
  changeTrackPropsCommand,
  findEvent,
} from '@sudobility/music_types';
import type { NoteEvent, Score } from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import {
  canReplace,
  commitBarTempo,
  controlLocked,
  defaultInspectorTab,
  measureClefOptions,
  noteTextFieldsVisible,
  repairIssuesOutcome,
  selectEditLocked,
  setClefAtMeasure,
} from './inspector.js';
import {
  changeVelocity,
  setFingering,
  setNotePitch,
  setTimeSignature,
} from './editing.js';
import {
  INSPECTOR_TABS,
  INSPECTOR_TAB_LABEL_KEY,
  MIX_ONLY_CONTROLS,
} from '@sudobility/music_types';

function makeStore(score: Score = twinkleScore()) {
  const store = testEditingStore();
  store.getState().setScore(score);
  return store;
}

function selectFirstNote(store: ReturnType<typeof makeStore>): NoteEvent {
  const note = allNotes(store.getState().score!)[0];
  store
    .getState()
    .setSelection({ eventIds: [note.id], measureIds: [], trackIds: [] });
  return note;
}

describe('inspector tabs', () => {
  it('are in the web order: Score, Track, Note, Bar, Unplugged', () => {
    expect(INSPECTOR_TABS).toEqual([
      'score',
      'track',
      'note',
      'measure',
      'unplugged',
    ]);
    expect(INSPECTOR_TAB_LABEL_KEY.measure).toBe('inspector.measure');
    expect(INSPECTOR_TAB_LABEL_KEY.unplugged).toBe('inspector.unplugged');
  });

  it('never auto-selects Unplugged from a selection, the same as Score', () => {
    const empty = { eventIds: [], measureIds: [], trackIds: [] };
    expect(defaultInspectorTab(empty)).not.toBe('unplugged');
  });

  it('default to what the selection is of, and to Track when nothing is', () => {
    const empty = { eventIds: [], measureIds: [], trackIds: [] };
    expect(defaultInspectorTab(empty)).toBe('track');
    expect(defaultInspectorTab({ ...empty, eventIds: ['n'] })).toBe('note');
    expect(defaultInspectorTab({ ...empty, measureIds: ['m'] })).toBe(
      'measure'
    );
    expect(defaultInspectorTab({ ...empty, trackIds: ['t'] })).toBe('track');
    // Notes win: a note click leaves a track id behind as well.
    expect(
      defaultInspectorTab({ eventIds: ['n'], measureIds: [], trackIds: ['t'] })
    ).toBe('note');
  });
});

describe('the edit lock, as the panel reads it', () => {
  it('locks content controls while playing and leaves mixing live', () => {
    const store = makeStore();
    expect(selectEditLocked(store.getState())).toBe(false);
    store.setTransport('playing');
    expect(selectEditLocked(store.getState())).toBe(true);
    expect(controlLocked(store.getState(), 'noteVelocity')).toBe(true);
    for (const control of MIX_ONLY_CONTROLS)
      expect(controlLocked(store.getState(), control)).toBe(false);
  });

  it('is not locked while paused', () => {
    const store = makeStore();
    store.setTransport('paused');
    expect(selectEditLocked(store.getState())).toBe(false);
  });
});

describe('noteTextFieldsVisible', () => {
  it('shows chord symbol and fingering for exactly one note', () => {
    expect(noteTextFieldsVisible([])).toBe(false);
    expect(noteTextFieldsVisible([{}])).toBe(true);
    expect(noteTextFieldsVisible([{}, {}])).toBe(false);
  });
});

describe('commitBarTempo', () => {
  it('writes a change at the bar, rounded and clamped', () => {
    const store = makeStore();
    const measure = store.getState().score!.tracks[0].measures[1];
    expect(commitBarTempo(store, measure, ' 91.6 ')).toBe(true);
    const event = store
      .getState()
      .score!.tempoMap.find(e => e.tick === measure.startTick);
    expect(event?.bpm).toBe(92);

    expect(commitBarTempo(store, measure, '9000')).toBe(true);
    expect(
      store.getState().score!.tempoMap.filter(e => e.tick === measure.startTick)
    ).toHaveLength(1);
    expect(
      store.getState().score!.tempoMap.find(e => e.tick === measure.startTick)
        ?.bpm
    ).toBe(400);
  });

  it('edits the bar’s own event rather than adding a second one', () => {
    const store = makeStore();
    const measure = store.getState().score!.tracks[0].measures[0];
    const opening = store.getState().score!.tempoMap[0];
    expect(commitBarTempo(store, measure, '80')).toBe(true);
    const map = store.getState().score!.tempoMap;
    expect(map).toHaveLength(1);
    expect(map[0].id).toBe(opening.id);
    expect(map[0].bpm).toBe(80);
  });

  it('skips blank text and a value already in force', () => {
    const store = makeStore();
    const measure = store.getState().score!.tracks[0].measures[2];
    const before = store.getState().score;
    const inForce = Math.round(before!.tempoMap[0].bpm);
    expect(commitBarTempo(store, measure, '')).toBe(false);
    expect(commitBarTempo(store, measure, 'fast')).toBe(false);
    expect(commitBarTempo(store, measure, String(inForce))).toBe(false);
    expect(store.getState().score).toBe(before);
  });

  it('compares against the rounded tempo, so an unrounded event is not rewritten', () => {
    const store = makeStore();
    const measure = store.getState().score!.tracks[0].measures[1];
    store
      .getState()
      .dispatchCommand(
        changeTempoCommand({ tick: measure.startTick, bpm: 99.6 }, 'tempo')
      );
    const before = store.getState().score;
    expect(commitBarTempo(store, measure, '100')).toBe(false);
    expect(store.getState().score).toBe(before);
  });
});

describe('measure clef', () => {
  it('setClefAtMeasure finds the measure’s own track and index', () => {
    const store = makeStore(twoTrackScore());
    const second = store.getState().score!.tracks[1];
    const measure = second.measures[2];
    expect(setClefAtMeasure(store, measure.id, 'tenor')).toBe(true);
    const after = store.getState().score!;
    expect(after.tracks[1].measures[2].clef).toBe('tenor');
    expect(after.tracks[0].measures[2].clef).toBeUndefined();
  });

  it('setClefAtMeasure answers false for an unknown measure', () => {
    const store = makeStore();
    expect(setClefAtMeasure(store, 'nope', 'bass')).toBe(false);
  });

  it('measureClefOptions offers Inherit except on bar 1', () => {
    const score = twinkleScore();
    const track = score.tracks[0];
    const first = measureClefOptions(track, 0);
    expect(first.options).toEqual([...CLEFS]);
    expect(first.value).toBe(track.clef);
    expect(first.inForce).toBe(track.clef);

    const later = measureClefOptions(track, 2);
    expect(later.options).toEqual([INHERIT_CLEF, ...CLEFS]);
    expect(later.value).toBe(INHERIT_CLEF);
    expect(later.inForce).toBe(track.clef);
  });

  it('measureClefOptions shows a bar’s own change and carries it forward', () => {
    const base = twinkleScore();
    const changed = changeMeasureClefCommand(
      base.tracks[0].id,
      1,
      'bass',
      'clef'
    ).execute(base);
    const track = changed.tracks[0];
    expect(measureClefOptions(track, 1).value).toBe('bass');
    expect(measureClefOptions(track, 2)).toMatchObject({
      value: INHERIT_CLEF,
      inForce: 'bass',
    });
  });
});

describe('canReplace', () => {
  it('needs a region for the scope, and a stopped transport', () => {
    const store = makeStore();
    expect(canReplace(store.getState(), 'notes')).toBe(false);
    expect(canReplace(store.getState(), 'track')).toBe(true);
    selectFirstNote(store);
    expect(canReplace(store.getState(), 'notes')).toBe(true);
    store.setTransport('playing');
    expect(canReplace(store.getState(), 'notes')).toBe(false);
  });

  it('is false with no score', () => {
    const store = testEditingStore();
    expect(canReplace(store.getState(), 'track')).toBe(false);
  });
});

describe('repairIssuesOutcome', () => {
  it('reports what left the list', () => {
    expect(repairIssuesOutcome({ fixed: 0, remaining: 3 })).toEqual({
      messageKey: 'editor.fixedNothing',
      params: {},
      severity: 'info',
      close: false,
    });
    expect(repairIssuesOutcome({ fixed: 2, remaining: 1 })).toEqual({
      messageKey: 'editor.fixedIssuesPartial',
      params: { count: 2, remaining: 1 },
      severity: 'success',
      close: false,
    });
    expect(repairIssuesOutcome({ fixed: 4, remaining: 0 })).toEqual({
      messageKey: 'editor.fixedIssues',
      params: { count: 4 },
      severity: 'success',
      close: true,
    });
  });
});

describe('field rules in the editing operations', () => {
  it('changeVelocity clamps to 0-127 and rounds', () => {
    const store = makeStore();
    const note = selectFirstNote(store);
    changeVelocity(store, 500);
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).velocity
    ).toBe(127);
    changeVelocity(store, 63.6);
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).velocity
    ).toBe(64);
    changeVelocity(store, -4);
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).velocity
    ).toBe(0);
    const before = store.getState().score;
    changeVelocity(store, Number.NaN);
    expect(store.getState().score).toBe(before);
    expect(store.getState().toasts).toEqual([]);
  });

  it('setNotePitch keeps the octave inside MIN_OCTAVE..MAX_OCTAVE', () => {
    const store = makeStore();
    const track = store.getState().score!.tracks[0];
    // A synth lead, whose compass is a guess rather than a fact, so the
    // instrument range does not refuse first and only the octave rule applies.
    store
      .getState()
      .dispatchCommand(
        changeTrackPropsCommand(track.id, { midiProgram: 80 }, 'synth')
      );
    const note = allNotes(store.getState().score!)[0];
    setNotePitch(
      store,
      note.id,
      { step: 'C', accidental: 0, octave: 42 },
      'concert'
    );
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).pitch.octave
    ).toBe(9);
    setNotePitch(
      store,
      note.id,
      { step: 'C', accidental: 0, octave: -7 },
      'concert'
    );
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).pitch.octave
    ).toBe(-1);
  });

  it('setTimeSignature refuses a denominator or numerator it cannot store', () => {
    const store = makeStore();
    const ids = [store.getState().score!.tracks[0].measures[0].id];
    const before = store.getState().score;
    expect(setTimeSignature(store, ids, { numerator: 3, denominator: 3 })).toBe(
      false
    );
    expect(setTimeSignature(store, ids, { numerator: 0, denominator: 4 })).toBe(
      false
    );
    expect(
      setTimeSignature(store, ids, {
        numerator: MAX_TIME_SIG_NUMERATOR + 1,
        denominator: 4,
      })
    ).toBe(false);
    expect(
      setTimeSignature(store, ids, { numerator: 2.5, denominator: 4 })
    ).toBe(false);
    expect(store.getState().score).toBe(before);
    expect(setTimeSignature(store, ids, { numerator: 6, denominator: 8 })).toBe(
      true
    );
  });

  it('changeVelocity says whether it wrote, and skips a velocity already there', () => {
    // A field committed on blur with nothing changed is not an undo entry, and
    // the panel needs the answer to know whether to reset its draft.
    const store = makeStore();
    const note = selectFirstNote(store);
    expect(changeVelocity(store, 100)).toBe(true);
    const before = store.getState().score;
    expect(changeVelocity(store, 100)).toBe(false);
    expect(changeVelocity(store, 100.2)).toBe(false);
    expect(changeVelocity(store, Number.NaN)).toBe(false);
    expect(store.getState().score).toBe(before);
    store.getState().clearSelection();
    expect(changeVelocity(store, 20)).toBe(false);
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).velocity
    ).toBe(100);
  });

  it('changeVelocity is false when the playback lock refuses it', () => {
    const store = makeStore();
    selectFirstNote(store);
    store.setTransport('playing');
    expect(changeVelocity(store, 12)).toBe(false);
  });

  it('setFingering says whether it wrote', () => {
    const store = makeStore();
    selectFirstNote(store);
    expect(setFingering(store, '3')).toBe(true);
    expect(setFingering(store, ' 3 ')).toBe(false);
    expect(setFingering(store, '')).toBe(true);
    expect(setFingering(store, undefined)).toBe(false);
    store.getState().clearSelection();
    expect(setFingering(store, '4')).toBe(false);
  });

  it('setNotePitch says whether it wrote', () => {
    const store = makeStore();
    const note = allNotes(store.getState().score!)[0] as NoteEvent;
    const up = { ...note.pitch, octave: note.pitch.octave + 1 };
    expect(setNotePitch(store, note.id, up, 'concert')).toBe(true);
    // The pitch it already has, and a note that is not there, write nothing.
    expect(setNotePitch(store, note.id, up, 'concert')).toBe(false);
    expect(setNotePitch(store, 'missing', up, 'concert')).toBe(false);
    expect(
      setNotePitch(store, note.id, { ...up, octave: Number.NaN }, 'concert')
    ).toBe(false);
  });

  it('setFingering trims, clears on blank, and skips what is already there', () => {
    const store = makeStore();
    const note = selectFirstNote(store);
    setFingering(store, '  1-2 ');
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).fingering
    ).toBe('1-2');
    const before = store.getState().score;
    setFingering(store, '1-2');
    expect(store.getState().score).toBe(before);
    setFingering(store, '   ');
    expect(
      (findEvent(store.getState().score!, note.id) as NoteEvent).fingering
    ).toBeUndefined();
  });
});
