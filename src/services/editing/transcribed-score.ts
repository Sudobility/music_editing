import {
  TempoMap,
  addMeasureCommand,
  addTrackCommand,
  deleteEventsCommand,
  isNoteEvent,
  pasteEventsCommand,
  ticksFor,
  transformCommand,
} from '@sudobility/music_types';
import type { NoteEvent, Score, ScoreCommand } from '@sudobility/music_types';

/** Merge an audio transcription into a score at the playhead. */
export function transcribedScoreCommand(
  recording: Score,
  anchorTick: number,
  scope: 'voice' | 'all'
): ScoreCommand | null {
  const vocal =
    recording.tracks.find(
      track =>
        track.midiChannel !== 9 &&
        (track.name.trim().toLowerCase() === 'voice' ||
          track.midiProgram === 53)
    ) ?? recording.tracks.find(track => track.midiChannel !== 9);
  const sources = scope === 'voice' ? (vocal ? [vocal] : []) : recording.tracks;
  if (
    !sources.some(track =>
      track.measures.some(measure =>
        measure.voices.some(voice => voice.events.some(isNoteEvent))
      )
    )
  )
    return null;

  const sourceTempo = new TempoMap([...recording.tempoMap], recording.ppq);
  return transformCommand(
    scope === 'voice' ? 'Record voice' : 'Transcribe audio',
    score => {
      const tempo = new TempoMap([...score.tempoMap], score.ppq);
      const baseSeconds = tempo.ticksToSeconds(Math.max(0, anchorTick));
      const quantum = Math.max(1, ticksFor('sixteenth', score.ppq));
      const snap = (tick: number) => Math.round(tick / quantum) * quantum;
      let result = score;

      for (const source of sources) {
        const notes = source.measures
          .flatMap(measure =>
            measure.voices.flatMap(voice => voice.events.filter(isNoteEvent))
          )
          .sort((a, b) => a.startTick - b.startTick);
        if (!notes.length) continue;
        const isVoice = scope === 'voice';
        let destination = isVoice
          ? result.tracks.find(
              track =>
                track.midiChannel !== 9 &&
                (track.name.trim().toLowerCase() === 'voice' ||
                  track.midiProgram === 53)
            )
          : result.tracks.find(
              track =>
                track.midiProgram === source.midiProgram &&
                (track.midiChannel === 9) === (source.midiChannel === 9)
            );

        if (!destination) {
          result = addTrackCommand(
            {
              name: isVoice ? 'Voice' : source.name,
              instrumentName: isVoice ? 'Voice Oohs' : source.instrumentName,
              midiProgram: isVoice ? 53 : source.midiProgram,
              midiChannel: source.midiChannel === 9 ? 9 : 0,
              clef: isVoice ? 'treble' : source.clef,
            },
            'Add transcription track'
          ).execute(result);
          destination = result.tracks[result.tracks.length - 1];
        }
        if (!destination) continue;

        const converted: NoteEvent[] = notes.map(note => {
          const startTick = snap(
            tempo.secondsToTicks(
              baseSeconds + sourceTempo.ticksToSeconds(note.startTick)
            )
          );
          const endTick = snap(
            tempo.secondsToTicks(
              baseSeconds +
                sourceTempo.ticksToSeconds(note.startTick + note.durationTicks)
            )
          );
          return {
            ...note,
            startTick,
            durationTicks: Math.max(quantum, endTick - startTick),
          };
        });
        const earliest = Math.min(...converted.map(note => note.startTick));
        const latest = Math.max(
          ...converted.map(note => note.startTick + note.durationTicks)
        );
        const overlapping = destination.measures.flatMap(measure =>
          measure.voices.flatMap(voice =>
            voice.events
              .filter(isNoteEvent)
              .filter(
                note =>
                  note.startTick < latest &&
                  note.startTick + note.durationTicks > earliest
              )
              .map(note => note.id)
          )
        );
        if (overlapping.length)
          result = deleteEventsCommand(
            overlapping,
            'Replace transcribed notes'
          ).execute(result);

        while (
          (result.tracks
            .find(track => track.id === destination!.id)
            ?.measures.at(-1)?.startTick ?? 0) +
            (result.tracks
              .find(track => track.id === destination!.id)
              ?.measures.at(-1)?.durationTicks ?? 0) <
          latest
        ) {
          result = addMeasureCommand('Extend for transcription').execute(
            result
          );
        }
        result = pasteEventsCommand(
          converted,
          {
            trackId: destination.id,
            voiceIndex: 0,
            anchorTick: earliest,
          },
          'Insert transcription'
        ).execute(result);
      }
      return result;
    }
  );
}
