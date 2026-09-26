import { describe, expect, it } from 'vitest';
import {
  getMusicPosition,
  getMusicPositionSource,
} from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import {
  addMeasureCommand,
  changeMetadataCommand,
  changeTrackPropsCommand,
  setUnpluggedListenerCommand,
} from '@sudobility/music_types';
import { deleteEventsCommand } from '@sudobility/music_types';
import { validateScore } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';

describe('score-slice', () => {
  describe('setScore', () => {
    it('adopts the score, recomputes validationIssues, and resets history by default', () => {
      const store = testEditingStore();
      const score = twinkleScore();

      store.getState().setScore(score);

      const state = store.getState();
      expect(state.score).toBe(score);
      expect(state.validationIssues).toEqual(validateScore(score));
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
      expect(state.undoLabel).toBeNull();
      expect(state.redoLabel).toBeNull();
    });

    it("resolves a percussion track's program to a real kit on the way in", () => {
      // A MIDI file sets whatever program it likes on channel 10, and until
      // this the number was read as an instrument. Corrected inbound so the
      // picker never has to show something the score does not say.
      const store = testEditingStore();
      const score = twinkleScore();
      const drums = {
        ...score.tracks[0],
        clef: 'percussion' as const,
        midiProgram: 45,
      };

      store
        .getState()
        .setScore({ ...score, tracks: [drums, ...score.tracks.slice(1)] });

      expect(store.getState().score?.tracks[0].midiProgram).toBe(40); // Brush
      expect(store.getState().score?.tracks[0].instrumentName).toBe(
        'Brush Kit'
      );
    });

    it('does not mark the project dirty for a correction the user did not make', () => {
      // Opening a project must not upload an edit. The correction rides along
      // with the user's next real one instead.
      const store = testEditingStore();
      const score = twinkleScore();
      const drums = {
        ...score.tracks[0],
        clef: 'percussion' as const,
        midiProgram: 45,
      };

      store
        .getState()
        .setScore({ ...score, tracks: [drums, ...score.tracks.slice(1)] });

      expect(store.dirtyCount() > 0).toBe(false);
      expect(store.dirtyCount()).toBe(0);
    });

    it('moves the shared caret to the top of a new score', () => {
      const store = testEditingStore();
      getMusicPositionSource().moveTo(960);
      store.getState().setScore(twinkleScore());
      expect(getMusicPosition().tick).toBe(0);
    });

    it('leaves the shared caret alone for a store opened in the background', () => {
      // A host with a store per document: the position is the front
      // document's, and a tab opened behind it must not move its caret.
      const store = testEditingStore();
      getMusicPositionSource().moveTo(960);
      store.getState().setScore(twinkleScore(), { resetPosition: false });
      expect(getMusicPosition().tick).toBe(960);
    });

    it('clears any prior undo/redo history when resetHistory is not false', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'Renamed' }, 'Change metadata')
        );
      expect(store.getState().canUndo).toBe(true);

      store.getState().setScore(twinkleScore());
      expect(store.getState().canUndo).toBe(false);
    });

    it('keeps existing history when resetHistory is false', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'Renamed' }, 'Change metadata')
        );
      expect(store.getState().canUndo).toBe(true);

      store.getState().setScore(twinkleScore(), { resetHistory: false });
      expect(store.getState().canUndo).toBe(true);
    });

    it('resets the playback caret when adopting a new score', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      getMusicPositionSource().moveTo(1920);

      store.getState().setScore(twinkleScore());

      expect(getMusicPosition().reportedTick).toBe(0);
    });
  });

  describe('dispatchCommand', () => {
    it('runs the command, updates score/validationIssues, mirrors undo/redo state, and marks the project dirty', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());

      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'New Title' }, 'Change metadata')
        );

      const state = store.getState();
      expect(state.score?.metadata.title).toBe('New Title');
      expect(state.canUndo).toBe(true);
      expect(state.undoLabel).toBe('Change metadata');
      expect(state.canRedo).toBe(false);
      expect(store.dirtyCount()).toBeGreaterThan(0);
    });

    it('is a no-op when there is no score loaded', () => {
      const store = testEditingStore();
      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'New Title' }, 'Change metadata')
        );
      expect(store.getState().score).toBeNull();
    });

    it('recomputes validationIssues after a mutation that changes the score', () => {
      const store = testEditingStore();
      const score = twinkleScore();
      store.getState().setScore(score);
      const firstNoteId = score.tracks[0].measures[0].voices[0].events[0].id;

      store
        .getState()
        .dispatchCommand(deleteEventsCommand([firstNoteId], 'Delete notes'));

      const state = store.getState();
      expect(state.score).not.toBe(score);
      expect(state.validationIssues).toEqual(validateScore(state.score!));
    });

    it('keeps the validation issues by identity for a command that touches nothing the validator reads', () => {
      // A listener move on the Unplugged stage is dispatched once per
      // animation frame while walking or dragging. The validator reads the
      // tracks and the tempo map; neither changed, so the old array stands —
      // and a host subscribed to it does not render for the move.
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      const before = store.getState().validationIssues;
      const tracks = store.getState().score!.tracks;

      store
        .getState()
        .dispatchCommand(
          setUnpluggedListenerCommand({ x: 1, z: 2 }, 'Move listener')
        );

      const state = store.getState();
      expect(state.score?.unplugged?.listener).toMatchObject({ x: 1, z: 2 });
      expect(state.validationIssues).toBe(before);
      expect(state.score?.tracks).toBe(tracks);
    });

    it('marks the project dirty for a listener move, since the arrangement is saved with the score', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      const before = store.dirtyCount();

      store
        .getState()
        .dispatchCommand(
          setUnpluggedListenerCommand({ x: 1, z: 2 }, 'Move listener')
        );

      expect(store.dirtyCount()).toBeGreaterThan(before);
    });

    it('judges dirtiness by identity, ignoring mute and solo on a track', () => {
      // A track whose only changed fields are `muted`/`solo` is not a
      // persisted change; a moved note is. (A mute *command* still dirties
      // the project today, because it also stamps `metadata` — this pins
      // the comparison, not that command.)
      const store = testEditingStore();
      const score = twinkleScore();
      store.getState().setScore(score);
      const before = store.dirtyCount();

      store.setState(state => {
        state.score = {
          ...score,
          tracks: score.tracks.map((track, i) =>
            i === 0 ? { ...track, muted: true } : track
          ),
        };
      });
      store
        .getState()
        .dispatchCommand(
          setUnpluggedListenerCommand({ facingDeg: 90 }, 'Turn listener')
        );
      // The listener turn is what dirtied it, exactly once.
      expect(store.dirtyCount()).toBe(before + 1);
    });
  });

  describe('undo/redo', () => {
    it('undo reverts the most recent command and updates the undo/redo mirrors', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'New Title' }, 'Change metadata')
        );

      store.getState().undo();

      const state = store.getState();
      expect(state.score?.metadata.title).toBe('Twinkle Twinkle Little Star');
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);
      expect(state.redoLabel).toBe('Change metadata');
    });

    it('redo re-applies an undone command', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'New Title' }, 'Change metadata')
        );
      store.getState().undo();

      store.getState().redo();

      const state = store.getState();
      expect(state.score?.metadata.title).toBe('New Title');
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });

    it('undo/redo are no-ops when there is nothing to undo/redo', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      const before = store.getState().score;

      store.getState().undo();
      store.getState().redo();

      expect(store.getState().score).toBe(before);
    });

    it('reports the document dirty on undo and redo', () => {
      const store = testEditingStore();
      store.getState().setScore(twinkleScore());
      store
        .getState()
        .dispatchCommand(
          changeMetadataCommand({ title: 'New Title' }, 'Change metadata')
        );
      // What the editing engine promises is that it SAYS the document
      // changed. What that then does to a save state is music_lib's project
      // slice, and is tested there.
      const afterEdit = store.dirtyCount();

      store.getState().undo();
      expect(store.dirtyCount()).toBeGreaterThan(afterEdit);

      const afterUndo = store.dirtyCount();
      store.getState().redo();
      expect(store.dirtyCount()).toBeGreaterThan(afterUndo);
    });
  });
});

describe('the playback edit lock', () => {
  const freshStore = () => {
    const store = testEditingStore();
    store.getState().setScore(twinkleScore());
    return store;
  };

  it('refuses a content command while playing, leaving the score untouched', () => {
    const store = freshStore();
    const before = store.getState().score;
    store.setTransport('playing');

    store.getState().dispatchCommand(addMeasureCommand('Add measure'));

    expect(store.getState().score).toBe(before); // same reference: nothing ran
  });

  it('accepts a mix command while playing', () => {
    const store = freshStore();
    const trackId = store.getState().score!.tracks[0].id;
    store.setTransport('playing');

    store
      .getState()
      .dispatchCommand(
        changeTrackPropsCommand(
          trackId,
          { muted: true },
          'Change track properties'
        )
      );

    expect(store.getState().score!.tracks[0].muted).toBe(true);
  });

  it('refuses undo and redo while playing', () => {
    const store = freshStore();
    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    const edited = store.getState().score;

    store.setTransport('playing');
    store.getState().undo();
    expect(store.getState().score).toBe(edited);
    store.getState().redo();
    expect(store.getState().score).toBe(edited);
  });

  it('refuses content, undo and redo while the edit lock is held, and mix still runs', () => {
    // A generation job owns the score for as long as it runs: its partials
    // land through `setScore`, and an edit accepted meanwhile is an edit of
    // music about to be replaced.
    const store = freshStore();
    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    const edited = store.getState().score!;
    const trackId = edited.tracks[0].id;

    store.getState().setEditLocked(true);
    expect(store.getState().editLocked).toBe(true);
    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    expect(store.getState().score).toBe(edited);
    store.getState().undo();
    expect(store.getState().score).toBe(edited);
    store.getState().redo();
    expect(store.getState().score).toBe(edited);
    store
      .getState()
      .dispatchCommand(
        changeTrackPropsCommand(
          trackId,
          { muted: true },
          'Change track properties'
        )
      );
    expect(store.getState().score!.tracks[0].muted).toBe(true);

    store.getState().setEditLocked(false);
    const before = store.getState().score;
    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    expect(store.getState().score).not.toBe(before);
  });

  it('accepts content again once playback stops', () => {
    const store = freshStore();
    store.setTransport('playing');
    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    store.setTransport('stopped');

    const before = store.getState().score;
    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    expect(store.getState().score).not.toBe(before);
  });

  it('does not mark the project dirty for a refused command', () => {
    // A refusal that still queued an autosave would upload an unchanged score.
    const store = freshStore();
    store.setTransport('playing');
    const dirtyBefore = store.dirtyCount() > 0;

    store.getState().dispatchCommand(addMeasureCommand('Add measure'));
    expect(store.dirtyCount() > 0).toBe(dirtyBefore);
  });
});
