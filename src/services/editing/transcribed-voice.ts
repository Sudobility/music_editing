import {
  TempoMap,
  addMeasureCommand,
  isNoteEvent,
  pasteEventsCommand,
  ticksFor,
  transformCommand,
} from '@sudobility/music_types';
import type { NoteEvent, Score, ScoreCommand } from '@sudobility/music_types';

/**
 * Place a solo transcription on the track that was active when recording began.
 * Preserve the recorded timing in seconds, then snap it to the destination
 * score's sixteenth-note grid. The whole insertion is one undoable command.
 */
export function transcribedVoiceCommand(
  recording: Score,
  trackId: string,
  voiceIndex: number,
  anchorTick: number
): ScoreCommand | null {
  // A solo voice job may also contain a drum track. Only the pitched vocal
  // track belongs in the editor voice; copying drums here makes the melody
  // sound like a scatter of unrelated pitches.
  const vocalTrack =
    recording.tracks.find(
      track =>
        track.midiChannel !== 9 && track.name.trim().toLowerCase() === 'voice'
    ) ?? recording.tracks.find(track => track.midiChannel !== 9);
  const source = (vocalTrack?.measures ?? [])
    .flatMap(measure =>
      measure.voices.flatMap(voice => voice.events.filter(isNoteEvent))
    )
    .sort((a, b) => a.startTick - b.startTick);
  if (source.length === 0) return null;
  const sourceTempo = new TempoMap([...recording.tempoMap], recording.ppq);

  return transformCommand('Record melody', score => {
    const track = score.tracks.find(item => item.id === trackId);
    if (!track) return score;
    const tempo = new TempoMap([...score.tempoMap], score.ppq);
    const baseSeconds = tempo.ticksToSeconds(Math.max(0, anchorTick));
    const quantum = Math.max(1, ticksFor('sixteenth', score.ppq));
    const snap = (tick: number) => Math.round(tick / quantum) * quantum;
    const notes: NoteEvent[] = source.map(note => {
      const start = snap(
        tempo.secondsToTicks(
          baseSeconds + sourceTempo.ticksToSeconds(note.startTick)
        )
      );
      const end = snap(
        tempo.secondsToTicks(
          baseSeconds +
            sourceTempo.ticksToSeconds(note.startTick + note.durationTicks)
        )
      );
      return {
        ...note,
        startTick: start,
        durationTicks: Math.max(quantum, end - start),
      };
    });
    const first = Math.min(...notes.map(note => note.startTick));
    const last = Math.max(
      ...notes.map(note => note.startTick + note.durationTicks)
    );
    let expanded = score;
    while (
      (expanded.tracks.find(item => item.id === trackId)?.measures.at(-1)
        ?.startTick ?? 0) +
        (expanded.tracks.find(item => item.id === trackId)?.measures.at(-1)
          ?.durationTicks ?? 0) <
      last
    ) {
      expanded = addMeasureCommand('Extend for recording').execute(expanded);
    }
    return pasteEventsCommand(
      notes,
      { trackId, voiceIndex, anchorTick: first },
      'Record melody'
    ).execute(expanded);
  });
}
