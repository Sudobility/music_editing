/**
 * Which keyboard keys light up during playback: the MIDI pitches currently
 * sounding on the active track.
 *
 * The engine reports sounding notes with their track and pitch already
 * resolved — it knew both when it scheduled them — so this is a filter over
 * data it was handed. It used to take bare note ids and call `findEvent` for
 * each, which is a linear scan of every track, measure and voice in the score,
 * run twenty times a second. On a large score that alone was measurable CPU.
 *
 * Shared because **both apps have a keyboard and only one had this rule**. The
 * React Native app lit every sounding note on every track, so on a multi-track
 * score its keys flickered with parts the reader could not see — the same
 * mistake the notation highlighting made before `noteColorsFor`, and the same
 * reason it is wrong: a lit key is meant to say "this is what you are hearing
 * on the part you are reading".
 */
import type {
  SoundingNote,
  TransportState,
  UUID,
} from '@sudobility/music_types';

export function playingPitchesForTrack(
  sounding: readonly SoundingNote[],
  trackId: UUID | null
): Set<number> {
  const pitches = new Set<number>();
  if (!trackId) return pitches;
  for (const note of sounding) {
    // Lighting a key for a note the user cannot see would be noise, not
    // information — the keyboard shows one track.
    if (note.trackId === trackId) pitches.add(note.midi);
  }
  return pitches;
}

/**
 * Every key the keyboard should draw pressed.
 *
 * The active track's sounding pitches — **only while playing** — plus the keys
 * a finger is holding. Gated on the transport rather than on the set being
 * non-empty because the engine clears sounding notes on `stop()` but not on
 * `pause()`, so without the gate a pause left whatever was mid-chord stuck
 * lit. The web keyboard had that gate and the held keys; the native keyboard
 * had neither, so a paused chord stayed lit and a held key did not show.
 */
export function litKeys(
  sounding: readonly SoundingNote[],
  activeTrackId: UUID | null,
  transportState: TransportState,
  held: Iterable<number>
): Set<number> {
  const lit =
    transportState === 'playing'
      ? playingPitchesForTrack(sounding, activeTrackId)
      : new Set<number>();
  for (const midi of held) lit.add(midi);
  return lit;
}
