import { describe, expect, it } from 'vitest';
import { allNotes, ticksFor, validateScore } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import type { Pitch } from '@sudobility/music_types';
import {
  commitLineDrawing,
  drawLineCommand,
  lineNotes,
  reviseLine,
  type LineSample,
} from './line-drawing.js';
import { testEditingStore } from '../../test/store.js';

const pitch = (step: Pitch['step'], octave = 4): Pitch => ({
  step,
  octave,
  accidental: 0,
});
const sample = (tick: number, note: Pitch): LineSample => ({
  tick,
  pitch: note,
  x: tick,
  y: 0,
});

describe('line drawing', () => {
  it('commits a gesture through one undoable edit', () => {
    const score = twinkleScore();
    const store = testEditingStore(score);
    commitLineDrawing(store, score.tracks[0]!.id, 0, [
      { startTick: 0, endTick: 240, pitch: pitch('G') },
    ]);
    expect(store.getState().score).not.toEqual(score);
    store.getState().undo();
    expect(store.getState().score).toEqual(score);
  });
  it('revises the future of a path when the pointer moves backward', () => {
    const original = [
      sample(0, pitch('C')),
      sample(120, pitch('D')),
      sample(240, pitch('E')),
    ];
    expect(
      reviseLine(original, sample(100, pitch('G'))).map(point => point.tick)
    ).toEqual([0, 100]);
  });

  it('keeps the drawn pitch on Acoustic Bass instead of clamping it down to its range', () => {
    const score = twinkleScore();
    const track = { ...score.tracks[0]!, midiProgram: 32 };
    const notes = lineNotes(
      [sample(0, pitch('C', 9)), sample(240, pitch('C', 9))],
      score,
      track
    );
    expect(notes.map(note => [note.startTick, note.endTick])).toEqual([
      [0, 240],
    ]);
    expect(notes[0]!.pitch).toEqual(pitch('C', 9));
  });

  it('drops excess tone changes so a one-bar stroke still lasts one bar', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const bar = track.measures[0]!.durationTicks;
    const samples = Array.from({ length: 33 }, (_, index) =>
      sample(index * (bar / 32), pitch('C', 2 + index))
    );
    const notes = lineNotes(samples, score, track);
    expect(notes.length).toBeLessThanOrEqual(
      bar / ticksFor('eighth', score.ppq)
    );
    expect(notes[0]!.startTick).toBe(0);
    expect(notes.at(-1)!.endTick).toBe(bar);
    expect(
      notes.every(
        (note, index) =>
          index === 0 || note.startTick === notes[index - 1]!.endTick
      )
    ).toBe(true);
  });

  it('rounds drawn pitch runs to eighth, quarter, half, or bar durations', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const bar = track.measures[0]!.durationTicks;
    const boundaries = [240, 720, 1680];
    const pitches = [pitch('C'), pitch('D'), pitch('E'), pitch('F')];
    const samples = Array.from({ length: 121 }, (_, index) => {
      const tick = index * 30;
      const pitchIndex = boundaries.findIndex(boundary => tick < boundary);
      return sample(tick, pitches[pitchIndex < 0 ? 3 : pitchIndex]!);
    });
    const notes = lineNotes(samples, score, track);
    expect(notes.map(note => note.pitch.step)).toEqual(['C', 'D', 'E', 'F']);
    expect(notes.map(note => note.endTick - note.startTick)).toEqual([
      score.ppq / 2,
      score.ppq,
      score.ppq * 2,
      bar,
    ]);
    expect(
      notes.every(
        (note, index) =>
          index === 0 || note.startTick === notes[index - 1]!.endTick
      )
    ).toBe(true);
  });

  it('replaces just the drawn span, ties across a barline, and undoes as one command', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const bar = track.measures[0]!.durationTicks;
    const command = drawLineCommand(track.id, 0, [
      { startTick: bar - 120, endTick: bar + 120, pitch: pitch('F') },
    ]);
    const edited = command.execute(score);
    const inserted = allNotes(edited).filter(
      note =>
        note.trackId === track.id &&
        note.pitch.step === 'F' &&
        note.startTick >= bar - 120 &&
        note.startTick < bar + 120
    );
    expect(inserted).toHaveLength(2);
    expect(inserted[0]!.tieStart).toBe(true);
    expect(inserted[1]!.tieStop).toBe(true);
    expect(command.undo(edited)).toEqual(score);
    expect(
      validateScore(edited).filter(issue => issue.severity === 'error')
    ).toEqual([]);
  });

  it('preserves both sides of an existing note when drawing through its middle', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const edited = drawLineCommand(track.id, 0, [
      { startTick: 120, endTick: 360, pitch: pitch('G') },
    ]).execute(score);
    const notes = allNotes(edited).filter(note => note.startTick < 480);
    expect(
      notes.map(note => [note.startTick, note.durationTicks, note.pitch.step])
    ).toEqual([
      [0, 120, 'C'],
      [120, 240, 'G'],
      [360, 120, 'C'],
    ]);
  });

  it('keeps an existing tie on the surviving side of a replacement', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const bar = track.measures[0]!.durationTicks;
    const tied = drawLineCommand(track.id, 0, [
      { startTick: bar - 120, endTick: bar + 120, pitch: pitch('F') },
    ]).execute(score);
    const edited = drawLineCommand(track.id, 0, [
      { startTick: bar - 90, endTick: bar - 30, pitch: pitch('G') },
    ]).execute(tied);
    const f = allNotes(edited).filter(
      note =>
        note.pitch.step === 'F' &&
        note.startTick >= bar - 120 &&
        note.startTick < bar + 120
    );
    expect(f.find(note => note.startTick === bar - 30)?.tieStart).toBe(true);
    expect(f.find(note => note.startTick === bar)?.tieStop).toBe(true);
    expect(
      validateScore(edited).filter(issue => issue.severity === 'error')
    ).toEqual([]);
  });
});
