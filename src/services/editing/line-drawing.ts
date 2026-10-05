/** Conversion and one-step commit for a line drawn over one score row. */
import {
  createId,
  ensureVoiceAtIndex,
  insertNoteIntoTrack,
  isNoteEvent,
  pitchToMidi,
  midiToPitch,
  reflowVoice,
  ticksFor,
  trackKeyboardRange,
  transformCommand,
  withTracks,
} from '@sudobility/music_types';
import type {
  NoteEvent,
  Pitch,
  Score,
  ScoreCommand,
  Track,
} from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import { dispatchTracked } from './editing.js';

export type LineSample = { tick: number; pitch: Pitch; x: number; y: number };
export type LineNote = { startTick: number; endTick: number; pitch: Pitch };

/** A backwards movement replaces the future of the current gesture. */
export function reviseLine(
  samples: readonly LineSample[],
  next: LineSample
): LineSample[] {
  const kept = samples.filter(sample => sample.tick < next.tick);
  return [...kept, next];
}

/** One note per uninterrupted pitch run; time resolution is a thirty-second note. */
export function lineNotes(
  samples: readonly LineSample[],
  score: Score,
  track: Track
): LineNote[] {
  if (samples.length < 2) return [];
  const quantum = Math.max(1, ticksFor('thirtysecond', score.ppq));
  const first = Math.max(0, Math.round(samples[0]!.tick / quantum) * quantum);
  const last =
    Math.round(samples[samples.length - 1]!.tick / quantum) * quantum;
  const trackEnd = track.measures.at(-1);
  const end = Math.min(
    last,
    trackEnd ? trackEnd.startTick + trackEnd.durationTicks : 0
  );
  if (end <= first) return [];

  const playable = trackKeyboardRange(track);
  const result: LineNote[] = [];
  let sampleIndex = 0;
  for (let tick = first; tick < end; tick += quantum) {
    const center = tick + quantum / 2;
    while (
      sampleIndex + 1 < samples.length &&
      Math.abs(samples[sampleIndex + 1]!.tick - center) <
        Math.abs(samples[sampleIndex]!.tick - center)
    ) {
      sampleIndex++;
    }
    const raw = samples[sampleIndex]!.pitch;
    const midi = Math.max(
      playable.min,
      Math.min(playable.max, pitchToMidi(raw))
    );
    const pitch = midi === pitchToMidi(raw) ? raw : midiToPitch(midi);
    const previous = result.at(-1);
    if (previous && pitchToMidi(previous.pitch) === midi)
      previous.endTick = Math.min(end, tick + quantum);
    else
      result.push({
        startTick: tick,
        endTick: Math.min(end, tick + quantum),
        pitch,
      });
  }
  return result;
}

/** Prefer one conventional value, then a short tied chain for longer runs. */
function rhythmicPieces(length: number, ppq: number): number[] {
  const names = [
    'dotted-whole',
    'whole',
    'dotted-half',
    'half',
    'dotted-quarter',
    'quarter',
    'dotted-eighth',
    'eighth',
    'dotted-sixteenth',
    'sixteenth',
    'dotted-thirtysecond',
    'thirtysecond',
    'triplet-quarter',
    'triplet-eighth',
    'triplet-sixteenth',
    'triplet-thirtysecond',
  ] as const;
  const values = [...new Set(names.map(name => ticksFor(name, ppq)))].filter(
    v => v > 0
  );
  const best: Array<number[] | null> = Array(length + 1).fill(null);
  best[0] = [];
  for (let total = 1; total <= length; total++) {
    for (const value of values) {
      const prior = total >= value ? best[total - value] : null;
      if (prior && (!best[total] || prior.length + 1 < best[total]!.length)) {
        best[total] = [...prior, value];
      }
    }
  }
  return best[length] ?? [length];
}

/** Replace just the drawn span in one voice and preserve notes outside it. */
export function drawLineCommand(
  trackId: string,
  voiceIndex: number,
  notes: readonly LineNote[]
): ScoreCommand {
  return transformCommand('Draw line', score => {
    const track = score.tracks.find(item => item.id === trackId);
    if (!track || notes.length === 0) return score;
    const from = notes[0]!.startTick;
    const to = notes[notes.length - 1]!.endTick;
    let edited: Track = {
      ...track,
      measures: track.measures.map(measure => {
        const voice = measure.voices[voiceIndex];
        if (!voice) return measure;
        if (
          !voice.events.some(
            event =>
              isNoteEvent(event) &&
              event.startTick < to &&
              event.startTick + event.durationTicks > from
          )
        )
          return measure;
        const survivors: NoteEvent[] = [];
        for (const event of voice.events) {
          if (!isNoteEvent(event)) continue;
          const start = event.startTick;
          const end = start + event.durationTicks;
          if (end <= from || start >= to) {
            survivors.push(event);
            continue;
          }
          if (start < from)
            survivors.push({
              ...event,
              durationTicks: from - start,
              tieStart: undefined,
            });
          if (end > to)
            survivors.push({
              ...event,
              id: createId(),
              startTick: to,
              durationTicks: end - to,
              tieStop: undefined,
            });
        }
        const withVoice = {
          ...measure,
          voices: measure.voices.map((item, index) =>
            index === voiceIndex ? { ...item, events: survivors } : item
          ),
        };
        return reflowVoice(withVoice, voice.id, trackId);
      }),
    };

    for (const line of notes) {
      const boundaries = edited.measures
        .map(measure => measure.startTick + measure.durationTicks)
        .filter(tick => tick > line.startTick && tick < line.endTick);
      const sections = [line.startTick, ...boundaries, line.endTick];
      const pieces: Array<{ start: number; duration: number }> = [];
      for (let index = 0; index < sections.length - 1; index++) {
        let cursor = sections[index]!;
        for (const duration of rhythmicPieces(
          sections[index + 1]! - cursor,
          score.ppq
        )) {
          pieces.push({ start: cursor, duration });
          cursor += duration;
        }
      }
      pieces.forEach((piece, index) => {
        const measure = edited.measures.find(
          item =>
            piece.start >= item.startTick &&
            piece.start < item.startTick + item.durationTicks
        );
        if (!measure) return;
        const ensured = ensureVoiceAtIndex(measure, voiceIndex, trackId);
        const voice = ensured.voices[voiceIndex]!;
        edited = insertNoteIntoTrack(
          edited,
          {
            id: createId(),
            trackId,
            voiceId: voice.id,
            startTick: piece.start,
            durationTicks: piece.duration,
            pitch: line.pitch,
            velocity: 80,
            ...(index > 0 ? { tieStop: true } : {}),
            ...(index < pieces.length - 1 ? { tieStart: true } : {}),
          },
          voiceIndex
        );
      });
    }
    // A cut can remove one end of an old tie. Keep ties whose two surviving
    // pieces still touch, and clear only flags whose partner was cut away.
    const voiceNotes = edited.measures
      .flatMap(
        measure => measure.voices[voiceIndex]?.events.filter(isNoteEvent) ?? []
      )
      .sort((a, b) => a.startTick - b.startTick);
    const byStart = new Map<string, NoteEvent[]>();
    const byEnd = new Map<string, NoteEvent[]>();
    for (const note of voiceNotes) {
      const midi = pitchToMidi(note.pitch);
      const startKey = `${note.startTick}:${midi}`;
      const endKey = `${note.startTick + note.durationTicks}:${midi}`;
      byStart.set(startKey, [...(byStart.get(startKey) ?? []), note]);
      byEnd.set(endKey, [...(byEnd.get(endKey) ?? []), note]);
    }
    const validFlags = new Map<
      string,
      { tieStart: boolean; tieStop: boolean }
    >();
    for (const note of voiceNotes) {
      const midi = pitchToMidi(note.pitch);
      const before = byEnd
        .get(`${note.startTick}:${midi}`)
        ?.some(candidate => candidate.tieStart);
      const after = byStart
        .get(`${note.startTick + note.durationTicks}:${midi}`)
        ?.some(candidate => candidate.tieStop);
      validFlags.set(note.id, {
        tieStop: Boolean(note.tieStop && before),
        tieStart: Boolean(note.tieStart && after),
      });
    }
    edited = {
      ...edited,
      measures: edited.measures.map(measure => ({
        ...measure,
        voices: measure.voices.map((voice, index) =>
          index !== voiceIndex
            ? voice
            : {
                ...voice,
                events: voice.events.map(event => {
                  if (!isNoteEvent(event)) return event;
                  const flags = validFlags.get(event.id);
                  return flags
                    ? {
                        ...event,
                        tieStart: flags.tieStart || undefined,
                        tieStop: flags.tieStop || undefined,
                      }
                    : event;
                }),
              }
        ),
      })),
    };
    return withTracks(
      score,
      score.tracks.map(item => (item.id === trackId ? edited : item))
    );
  });
}

/** Commit one whole gesture through the shared editing lock, validation and history. */
export function commitLineDrawing<T extends EditingState>(
  store: EditingStoreApi<T>,
  trackId: string,
  voiceIndex: number,
  notes: readonly LineNote[]
): void {
  const state = store.getState();
  if (!state.score || state.state === 'playing' || notes.length === 0) return;
  dispatchTracked(store, drawLineCommand(trackId, voiceIndex, notes));
}
