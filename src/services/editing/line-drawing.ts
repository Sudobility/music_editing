/** Conversion and one-step commit for a line drawn over one score row. */
import {
  createId,
  ensureVoiceAtIndex,
  insertNoteIntoTrack,
  isNoteEvent,
  pitchToMidi,
  reflowVoice,
  ticksFor,
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

/** Preserve pitch changes at thirty-second-note resolution, then round lengths. */
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
    const pitch = samples[sampleIndex]!.pitch;
    const midi = pitchToMidi(pitch);
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
  const eighth = ticksFor('eighth', score.ppq);
  const trackEndTick = trackEnd!.startTick + trackEnd!.durationTicks;
  const cursor = Math.max(
    0,
    Math.min(trackEndTick, Math.round(first / eighth) * eighth)
  );
  const targetEnd = Math.min(
    trackEndTick,
    cursor + Math.max(eighth, end - first)
  );
  const targetLength = targetEnd - cursor;
  const durationFor = (run: LineNote): number => {
    const bar =
      track.measures.find(
        measure =>
          run.startTick >= measure.startTick &&
          run.startTick < measure.startTick + measure.durationTicks
      )?.durationTicks ?? ticksFor('whole', score.ppq);
    const lengths = [
      ...new Set([
        eighth,
        ticksFor('quarter', score.ppq),
        ticksFor('half', score.ppq),
        bar,
      ]),
    ]
      .filter(length => length > 0 && length <= bar)
      .sort((a, b) => a - b);
    const rawLength = run.endTick - run.startTick;
    const fullBars = Math.floor(rawLength / bar);
    const remainder = rawLength - fullBars * bar;
    const nearest =
      remainder > 0
        ? lengths.reduce((best, length) =>
            Math.abs(length - remainder) < Math.abs(best - remainder)
              ? length
              : best
          )
        : 0;
    const duration = Math.max(eighth, fullBars * bar + nearest);
    return duration;
  };
  const runs = result.map(run => ({ ...run, duration: durationFor(run) }));
  const totalDuration = () => runs.reduce((sum, run) => sum + run.duration, 0);
  // Quantising each tiny pitch wobble up to an eighth can otherwise make a
  // one-bar stroke several bars long. Merge the shortest run into its closest
  // neighbour until the notes fit the time the pointer actually covered.
  while (runs.length > 1 && totalDuration() > targetLength) {
    const shortest = runs.reduce(
      (best, run, index) =>
        run.endTick - run.startTick <
        runs[best]!.endTick - runs[best]!.startTick
          ? index
          : best,
      0
    );
    const neighbour =
      shortest === 0
        ? 1
        : shortest === runs.length - 1
          ? shortest - 1
          : Math.abs(
                pitchToMidi(runs[shortest - 1]!.pitch) -
                  pitchToMidi(runs[shortest]!.pitch)
              ) <=
              Math.abs(
                pitchToMidi(runs[shortest + 1]!.pitch) -
                  pitchToMidi(runs[shortest]!.pitch)
              )
            ? shortest - 1
            : shortest + 1;
    const left = Math.min(shortest, neighbour);
    const right = Math.max(shortest, neighbour);
    const chosenPitch =
      runs[shortest]!.endTick - runs[shortest]!.startTick >=
      runs[neighbour]!.endTick - runs[neighbour]!.startTick
        ? runs[shortest]!.pitch
        : runs[neighbour]!.pitch;
    const merged: LineNote = {
      startTick: runs[left]!.startTick,
      endTick: runs[right]!.endTick,
      pitch: chosenPitch,
    };
    runs.splice(left, 2, { ...merged, duration: durationFor(merged) });
  }
  if (runs.length === 0 || targetLength <= 0) return [];
  const total = totalDuration();
  if (total < targetLength)
    runs[runs.length - 1]!.duration += targetLength - total;
  let at = cursor;
  return runs.flatMap(run => {
    if (at >= targetEnd) return [];
    const note = {
      startTick: at,
      endTick: Math.min(targetEnd, at + run.duration),
      pitch: run.pitch,
    };
    at = note.endTick;
    return note.endTick > note.startTick ? [note] : [];
  });
}

/** Use only an eighth, quarter, half, or full bar for each drawn note. */
function rhythmicPieces(
  length: number,
  ppq: number,
  barLength: number
): number[] {
  const values = [
    barLength,
    ticksFor('half', ppq),
    ticksFor('quarter', ppq),
    ticksFor('eighth', ppq),
  ].filter((value, index, all) => value > 0 && all.indexOf(value) === index);
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
          score.ppq,
          edited.measures.find(
            measure =>
              cursor >= measure.startTick &&
              cursor < measure.startTick + measure.durationTicks
          )?.durationTicks ?? 0
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
