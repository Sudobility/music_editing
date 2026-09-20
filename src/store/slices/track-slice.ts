/**
 * Editing the selected track.
 *
 * A property sheet should reflect state and invoke behaviour, not contain it.
 * Everything a track editor does — rename, change instrument, change clef, mix,
 * delete — is a rule about a score, not about a panel: the instrument's name
 * must move with its program, a percussion program addresses a kit rather than
 * an instrument, changing instrument carries the existing notes into the new
 * compass, and the last track cannot be deleted. Every one of those was
 * duplicated in the app once and got at least one of them wrong.
 *
 * So they live here as actions, and the panel calls them with the value its
 * control produced. Each names its own undo entry through `commandLabel` — the
 * host's copy, since this library holds no user-facing words — so the two apps
 * cannot label the same edit differently. A `label` argument still overrides
 * it, for a caller that has a reason to.
 *
 * These are conveniences over `dispatchCommand`, not a way around it — they all
 * go through it, so the edit lock (no content changes while the transport
 * plays) and the undo history apply exactly as they do to any other edit.
 */
import type {
  Clef,
  ScoreMetadataPatch,
  TrackMixPatch,
  UUID,
} from '@sudobility/music_types';
import {
  changeClefCommand,
  changeTrackPropsCommand,
  deleteTrackCommand,
} from '@sudobility/music_types';
import { changeMetadataCommand } from '@sudobility/music_types';
import {
  changeInstrumentCommand,
  fitShiftForInstrument,
} from '@sudobility/music_types';
import { instrumentChoiceFor } from '@sudobility/music_types';
import { clampPan, clampVolume, quantizeMix } from '@sudobility/music_types';
import type { EditingState, SliceArgs } from '../editing-store.js';
import { commandLabel } from '../../services/editing/copy.js';

/**
 * Why an instrument change did nothing.
 *
 * `outOfRange` means the track's music spans more than the instrument can
 * play, so no shift would fit it — the caller has the instrument's name to say
 * so with. `noTrack` means the id no longer resolves.
 */
export type TrackInstrumentResult =
  | { ok: true }
  | { ok: false; reason: 'outOfRange'; instrumentName: string }
  | { ok: false; reason: 'noTrack' };

export type TrackSlice = {
  /**
   * Renames a track. Trimmed; a blank name, an unknown track and a name equal
   * to the current one are refused rather than stored. Returns whether it
   * wrote — so a field blurred without an edit puts nothing on the history.
   */
  renameTrack: (trackId: UUID, name: string, label?: string) => boolean;

  /**
   * Sets the instrument from a catalogue value — the string an
   * `INSTRUMENT_OPTIONS` or `KIT_OPTIONS` control produces, kit prefix and all.
   *
   * Takes the raw value rather than a resolved program so that the kit/melodic
   * distinction is decided in one place: program 40 is Violin *and* the Brush
   * kit, and every caller that resolved it itself eventually got it wrong.
   *
   * Melodic programs carry the existing notes into the new compass; a kit
   * change does not, because a drum part's numbers are kit positions rather
   * than pitches and shifting them would rewrite which drums are played.
   */
  setTrackInstrument: (
    trackId: UUID,
    value: string,
    label?: string
  ) => TrackInstrumentResult;

  setTrackClef: (trackId: UUID, clef: Clef, label?: string) => void;

  /**
   * Volume, pan, mute and solo — `kind: 'mix'`, so these work while playing.
   *
   * Volume is clamped to 0-1 and pan to -1..1, and both are snapped onto
   * `MIX_STEP`: a slider's float arithmetic otherwise stores 0.07000000001 and
   * round-trips it through the project that way.
   */
  setTrackMix: (trackId: UUID, patch: TrackMixPatch, label?: string) => void;

  /**
   * Deletes a track, unless it is the last one.
   *
   * The floor is one: a score with no tracks renders nothing and has no
   * meaningful measure grid to add a track back into. Returns whether it went
   * ahead, and `canDeleteTrack` answers the same question ahead of time so an
   * affordance can be disabled rather than failing on click.
   */
  removeTrack: (trackId: UUID, label?: string) => boolean;
  canDeleteTrack: () => boolean;

  /**
   * Sets the score's own title, composer or description.
   *
   * Distinct from the *project* name, which names the row this score is stored
   * in. The title is what travels with the music: it names exported files and
   * fills MusicXML's work title, so a project renamed after creation kept
   * exporting under whatever its template was called until something could
   * write this.
   *
   * A blank title is refused for the same reason a blank track name is —
   * everything downstream uses it as a filename. Fields equal (after trimming)
   * to what the score already holds are dropped, and a patch with nothing left
   * writes nothing. Returns whether it wrote.
   */
  setScoreMetadata: (patch: ScoreMetadataPatch, label?: string) => boolean;
};

export const createTrackSlice = <T extends EditingState>({
  get,
}: SliceArgs<T>): TrackSlice => ({
  renameTrack: (trackId, name, label = commandLabel('changeTrackProps')) => {
    const trimmed = name.trim();
    if (trimmed === '') return false;
    const track = get().score?.tracks.find(t => t.id === trackId);
    if (!track || track.name === trimmed) return false;
    get().dispatchCommand(
      changeTrackPropsCommand(trackId, { name: trimmed }, label)
    );
    return true;
  },

  setTrackInstrument: (
    trackId,
    value,
    label = commandLabel('changeTrackProps')
  ) => {
    const { score, dispatchCommand } = get();
    if (!score) return { ok: false, reason: 'noTrack' };

    const choice = instrumentChoiceFor(value);
    const track = score.tracks.find(t => t.id === trackId);
    if (!track) return { ok: false, reason: 'noTrack' };

    if (track.clef === 'percussion') {
      dispatchCommand(
        changeTrackPropsCommand(
          trackId,
          {
            midiProgram: choice.midiProgram,
            instrumentName: choice.instrumentName,
          },
          label
        )
      );
      return { ok: true };
    }

    // Asked before dispatching, so a change that would be refused is reported
    // rather than silently doing nothing — the command itself returns the
    // score untouched in that case.
    if (fitShiftForInstrument(score, trackId, choice.midiProgram) === null)
      return {
        ok: false,
        reason: 'outOfRange',
        instrumentName: choice.instrumentName,
      };

    dispatchCommand(
      changeInstrumentCommand(
        trackId,
        {
          midiProgram: choice.midiProgram,
          instrumentName: choice.instrumentName,
        },
        label
      )
    );
    return { ok: true };
  },

  setTrackClef: (trackId, clef, label = commandLabel('changeClef')) => {
    get().dispatchCommand(changeClefCommand(trackId, clef, label));
  },

  setTrackMix: (trackId, input, label = commandLabel('changeTrackProps')) => {
    const patch: TrackMixPatch = { ...input };
    if (input.volume !== undefined)
      patch.volume = clampVolume(quantizeMix(input.volume));
    if (input.pan !== undefined) patch.pan = clampPan(quantizeMix(input.pan));
    get().dispatchCommand(changeTrackPropsCommand(trackId, patch, label));
    if (patch.solo === true) get().setActiveTrack(trackId);
  },

  removeTrack: (trackId, label = commandLabel('deleteTrack')) => {
    if (!get().canDeleteTrack()) return false;
    get().dispatchCommand(deleteTrackCommand(trackId, label));
    return true;
  },

  canDeleteTrack: () => (get().score?.tracks.length ?? 0) > 1,

  setScoreMetadata: (patch, label = commandLabel('changeMetadata')) => {
    const metadata = get().score?.metadata;
    if (!metadata) return false;
    const trimmed: ScoreMetadataPatch = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (title === '') return false;
      if (title !== metadata.title) trimmed.title = title;
    }
    if (patch.composer !== undefined) {
      const composer = patch.composer.trim();
      if (composer !== (metadata.composer ?? '')) trimmed.composer = composer;
    }
    if (patch.description !== undefined) {
      const description = patch.description.trim();
      if (description !== (metadata.description ?? ''))
        trimmed.description = description;
    }
    if (Object.keys(trimmed).length === 0) return false;

    get().dispatchCommand(changeMetadataCommand(trimmed, label));
    return true;
  },
});
