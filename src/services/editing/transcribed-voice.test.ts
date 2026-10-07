import { describe, expect, it } from 'vitest';
import { allNotes, validateScore } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import { transcribedVoiceCommand } from './transcribed-voice.js';

describe('transcribedVoiceCommand', () => {
  it('ignores drum notes in a solo voice transcription', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const recording = {
      ...score,
      tracks: [
        { ...track, name: 'Voice' },
        { ...track, id: 'drums', name: 'Drums', midiChannel: 9 },
      ],
    };
    const end =
      track.measures.at(-1)!.startTick + track.measures.at(-1)!.durationTicks;
    const command = transcribedVoiceCommand(recording, track.id, 0, end);
    const result = command!.execute(score);
    const inserted = allNotes(result).filter(note => note.startTick >= end);
    expect(inserted).toHaveLength(allNotes(score).length);
  });

  it('places the take at the captured position, extends the score, and undoes it as one edit', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const end =
      track.measures.at(-1)!.startTick + track.measures.at(-1)!.durationTicks;
    const store = testEditingStore(score);
    const command = transcribedVoiceCommand(score, track.id, 0, end);

    expect(command).not.toBeNull();
    store.getState().dispatchCommand(command!);
    const result = store.getState().score!;
    expect(allNotes(result).some(note => note.startTick >= end)).toBe(true);
    expect(result.tracks[0]!.measures.length).toBeGreaterThan(
      track.measures.length
    );
    expect(
      validateScore(result).filter(issue => issue.severity === 'error')
    ).toEqual([]);

    store.getState().undo();
    expect(store.getState().score).toEqual(score);
  });

  it('does nothing when the transcription contains no notes', () => {
    const score = twinkleScore();
    const empty = {
      ...score,
      tracks: score.tracks.map(track => ({
        ...track,
        measures: track.measures.map(measure => ({
          ...measure,
          voices: measure.voices.map(voice => ({ ...voice, events: [] })),
        })),
      })),
    };
    expect(
      transcribedVoiceCommand(empty, score.tracks[0]!.id, 0, 0)
    ).toBeNull();
  });
});
