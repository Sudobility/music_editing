/**
 * Editing the Unplugged stage — where the listener stands and faces, and
 * where each instrument is placed.
 *
 * Same shape as `track-slice.ts`'s `setTrackMix`: a convenience over
 * `dispatchCommand`, not a way around it, so the mix-only playback carve-out
 * and undo history apply exactly as they do to any other edit. All three
 * commands are `kind: "mix"` — dragging the stage has to work while the
 * transport plays, which is the whole point of hearing it change live.
 */
import {
  resetUnpluggedArrangementCommand,
  setUnpluggedListenerCommand,
  setUnpluggedTrackPositionCommand,
} from '@sudobility/music_types';
import type {
  UnpluggedListener,
  UnpluggedPoint,
  UUID,
} from '@sudobility/music_types';
import type { EditingState, SliceArgs } from '../editing-store.js';
import { commandLabel } from '../../services/editing/copy.js';

export type UnpluggedSlice = {
  /** Moves and/or turns the listener. A patch — a drag sends `{x, z}`, a turn `{facingDeg}`, independently. */
  setUnpluggedListener: (
    patch: Partial<UnpluggedListener>,
    label?: string
  ) => void;

  /** Moves one instrument to an explicit stage position. */
  setUnpluggedTrackPosition: (
    trackId: UUID,
    point: UnpluggedPoint,
    label?: string
  ) => void;

  /** Clears the saved arrangement, reverting every position to the computed default half-circle. */
  resetUnpluggedArrangement: (label?: string) => void;
};

export const createUnpluggedSlice = <T extends EditingState>({
  get,
}: SliceArgs<T>): UnpluggedSlice => ({
  setUnpluggedListener: (patch, label) => {
    const isTurn = 'facingDeg' in patch && !('x' in patch) && !('z' in patch);
    get().dispatchCommand(
      setUnpluggedListenerCommand(
        patch,
        label ??
          commandLabel(
            isTurn ? 'turnUnpluggedListener' : 'moveUnpluggedListener'
          )
      )
    );
  },

  setUnpluggedTrackPosition: (trackId, point, label) => {
    get().dispatchCommand(
      setUnpluggedTrackPositionCommand(
        trackId,
        point,
        label ?? commandLabel('moveUnpluggedTrack')
      )
    );
  },

  resetUnpluggedArrangement: label => {
    get().dispatchCommand(
      resetUnpluggedArrangementCommand(
        label ?? commandLabel('resetUnpluggedArrangement')
      )
    );
  },
});
