import { describe, expect, it } from 'vitest';
import { testEditingStore } from '../../test/store.js';
import { EDIT_MODES, EDIT_MODE_OPTIONS } from './ui-slice.js';
import type { EditMode } from './ui-slice.js';

describe('ui-slice', () => {
  it('defaults to no explicit active track, system theme, zoom 1, quarter-note snap, developer mode off', () => {
    const store = testEditingStore();
    const state = store.getState();
    expect(state.activeTrackId).toBeNull();
    expect(state.visibleTrackIds).toBeNull();
    expect(state.editMode).toBe('replace');
    expect(state.themeMode).toBe('system');
    expect(state.zoom).toBe(1);
    expect(state.snapGrid).toBe('quarter');
    expect(state.developerMode).toBe(false);
    expect(state.toasts).toEqual([]);
    expect(state.dialogs).toEqual({});
  });

  it('simple setters write their own field', () => {
    const store = testEditingStore();
    store.getState().setActiveTrack('track-1');
    expect(store.getState().activeTrackId).toBe('track-1');
    store.getState().setThemeMode('dark');
    expect(store.getState().themeMode).toBe('dark');
    store.getState().setZoom(2);
    expect(store.getState().zoom).toBe(2);
    store.getState().setSnapGrid('eighth');
    expect(store.getState().snapGrid).toBe('eighth');
    store.getState().setDeveloperMode(true);
    expect(store.getState().developerMode).toBe(true);
  });

  describe('visible tracks', () => {
    it('setVisibleTracks stores the list and marks the project dirty', () => {
      const store = testEditingStore();
      store.getState().setVisibleTracks(['a', 'b']);
      expect(store.getState().visibleTrackIds).toEqual(['a', 'b']);
      expect(store.dirtyCount() > 0).toBe(true);
    });

    it('setVisibleTracks refuses an empty list', () => {
      const store = testEditingStore();
      store.getState().setVisibleTracks(['a']);
      store.getState().setVisibleTracks([]);
      expect(store.getState().visibleTrackIds).toEqual(['a']);
    });

    it('setActiveTrack reveals a hidden track', () => {
      const store = testEditingStore();
      store.getState().setVisibleTracks(['a']);
      store.getState().setActiveTrack('b');
      expect(store.getState().visibleTrackIds).toEqual(['a', 'b']);
    });

    it('setActiveTrack leaves visibility alone when nothing is hidden', () => {
      const store = testEditingStore();
      store.getState().setActiveTrack('b');
      expect(store.getState().visibleTrackIds).toBeNull();
    });

    it('setActiveTrack on an already-visible track does not mark dirty', () => {
      // Only a change worth persisting should trigger a save; moving the
      // caret's track around must not queue writes.
      const store = testEditingStore();
      store.getState().setVisibleTracks(['a', 'b']);
      const before = store.dirtyCount();
      store.getState().setActiveTrack('b');
      expect(store.dirtyCount()).toBe(before);
    });
  });

  describe('setDevSettings', () => {
    it('merges the patch into devSettings', () => {
      const store = testEditingStore();
      store.getState().setDevSettings({ showIds: true });
      expect(store.getState().devSettings.showIds).toBe(true);
      expect(store.getState().devSettings.showTicks).toBe(false); // untouched
    });
  });

  describe('dialogs', () => {
    it('openDialog/closeDialog/toggleDialog track per-id open state', () => {
      const store = testEditingStore();
      store.getState().openDialog('newProject');
      expect(store.getState().dialogs.newProject).toBe(true);

      store.getState().closeDialog('newProject');
      expect(store.getState().dialogs.newProject).toBe(false);

      store.getState().toggleDialog('midiImport');
      expect(store.getState().dialogs.midiImport).toBe(true);
      store.getState().toggleDialog('midiImport');
      expect(store.getState().dialogs.midiImport).toBe(false);
    });
  });

  describe('toasts', () => {
    it('pushToast enqueues a toast and returns its id; dismissToast removes it', () => {
      const store = testEditingStore();
      const id = store.getState().pushToast({ message: 'Saved' });
      expect(store.getState().toasts).toHaveLength(1);
      expect(store.getState().toasts[0]).toEqual({
        id,
        message: 'Saved',
        severity: 'info',
      });

      store.getState().dismissToast(id);
      expect(store.getState().toasts).toEqual([]);
    });

    it('pushToast defaults severity to "info" but honors an explicit one', () => {
      const store = testEditingStore();
      store.getState().pushToast({ message: 'Uh oh', severity: 'error' });
      expect(store.getState().toasts[0].severity).toBe('error');
    });
  });
});

describe('activeTrackId', () => {
  it('setActiveTrack(null) clears an explicit choice', () => {
    const store = testEditingStore();
    store.getState().setActiveTrack('track-1');
    store.getState().setActiveTrack(null);
    expect(store.getState().activeTrackId).toBeNull();
  });

  describe('edit mode', () => {
    it('defaults to replace, which is what the editor already did', () => {
      const store = testEditingStore();
      expect(store.getState().editMode).toBe('replace');
    });

    it('sets each mode', () => {
      const store = testEditingStore();
      for (const mode of ['insert', 'stack', 'replace'] as const) {
        store.getState().setEditMode(mode);
        expect(store.getState().editMode).toBe(mode);
      }
    });

    it('does not mark the project dirty', () => {
      // A mode is how you are editing, not part of the music. Persisting it
      // would queue a save on every toggle.
      const store = testEditingStore();
      store.getState().setEditMode('insert');
      expect(store.dirtyCount() > 0).toBe(false);
    });
  });
});

describe('active voice', () => {
  it('defaults to the first voice', () => {
    const store = testEditingStore();
    expect(store.getState().activeVoiceIndex).toBe(0);
  });

  it('sets the voice', () => {
    const store = testEditingStore();
    store.getState().setActiveVoice(1);
    expect(store.getState().activeVoiceIndex).toBe(1);
  });

  it('clamps a negative index rather than writing into a voice that is not one', () => {
    const store = testEditingStore();
    store.getState().setActiveVoice(-3);
    expect(store.getState().activeVoiceIndex).toBe(0);
  });
});

describe('pitchDisplay', () => {
  it('starts in concert pitch and toggles to written', () => {
    // Concert by default: nothing changes for anyone who does not ask.
    const store = testEditingStore();
    expect(store.getState().pitchDisplay).toBe('concert');
    store.getState().setPitchDisplay('written');
    expect(store.getState().pitchDisplay).toBe('written');
  });
});

describe('EDIT_MODE_OPTIONS', () => {
  it('offers every edit mode once, in toolbar order', () => {
    expect(EDIT_MODE_OPTIONS.map(option => option.value)).toEqual([
      ...EDIT_MODES,
    ]);
    expect(EDIT_MODES).toEqual(['insert', 'replace', 'stack']);
  });

  it('carries a label key, a hint key and a glyph for each', () => {
    for (const option of EDIT_MODE_OPTIONS) {
      expect(option.labelKey).toBe(`editor.${option.value}Mode`);
      expect(option.hintKey).toBe(`editor.${option.value}ModeHint`);
      expect(option.icon).toMatch(/Icon$/);
    }
  });

  it('is typed as the edit modes this package declares', () => {
    const values: readonly EditMode[] = EDIT_MODE_OPTIONS.map(o => o.value);
    expect(values).toEqual([...EDIT_MODES]);
  });
});
