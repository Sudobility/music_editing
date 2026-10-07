import { describe, expect, it } from 'vitest';
import { allNotes } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import { transcribedScoreCommand } from './transcribed-score.js';

describe('transcribedScoreCommand', () => {
  it('replaces the span in the first matching instrument track', () => {
    const score = twinkleScore();
    const track = score.tracks[0]!;
    const take = {
      ...score,
      tracks: [{ ...track, measures: track.measures.slice(0, 1) }],
    };
    const old = allNotes({ ...score, tracks: [track] }).slice(0, 1)[0]!;
    const command = transcribedScoreCommand(take, old.startTick, 'all');
    expect(command).not.toBeNull();
    const next = command!.execute(score);
    expect(next.tracks[0]!.id).toBe(track.id);
    expect(allNotes(next).some(note => note.id === old.id)).toBe(false);
    expect(next.tracks).toHaveLength(score.tracks.length);
  });

  it('creates a track for a newly transcribed instrument', () => {
    const score = twinkleScore();
    const source = score.tracks[0]!;
    const take = {
      ...score,
      tracks: [
        {
          ...source,
          id: 'new-take',
          name: 'Electric Guitar',
          instrumentName: 'Electric Guitar (clean)',
          midiProgram: 27,
        },
      ],
    };
    const command = transcribedScoreCommand(take, 0, 'all');
    expect(command).not.toBeNull();
    const next = command!.execute(score);
    expect(next.tracks).toHaveLength(score.tracks.length + 1);
    expect(next.tracks.at(-1)?.midiProgram).toBe(27);
    expect(
      allNotes({ ...next, tracks: [next.tracks.at(-1)!] }).length
    ).toBeGreaterThan(0);
  });
});
