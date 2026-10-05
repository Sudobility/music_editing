import { describe, expect, it } from 'vitest';
import { twoTrackScore } from '@sudobility/music_types/test';
import { allNotes, emptySelection } from '@sudobility/music_types';
import { testEditingStore } from '../../test/store.js';
import {
  runScoreContextAction,
  scoreContextMenuModel,
} from './context-menu.js';
import { SCORE_CONTEXT_ACTIONS } from '@sudobility/music_types';

function enabled(model: ReturnType<typeof scoreContextMenuModel>) {
  return Object.fromEntries(model.entries.map(e => [e.action, e.enabled]));
}

describe('scoreContextMenuModel', () => {
  it('keeps one shape in one order whatever is selected', () => {
    const model = scoreContextMenuModel({
      selection: emptySelection(),
      clipboard: null,
      playing: false,
    });
    expect(model.entries.map(e => e.action)).toEqual([
      ...SCORE_CONTEXT_ACTIONS,
    ]);
    expect(model.entries.map(e => e.labelKey)).toEqual([
      'editor.copy',
      'editor.cut',
      'editor.clear',
      'editor.deleteSelection',
      'editor.paste',
      'editor.selectAllNotes',
    ]);
    expect(model.subject).toBeNull();
    expect(model.titleKey).toBe('editor.scoreActions');
    expect(enabled(model)).toEqual({
      copy: false,
      cut: false,
      clear: false,
      delete: false,
      paste: false,
      selectAll: true,
    });
  });

  it('names the subject, and counts bars rather than per-track ids', () => {
    const score = twoTrackScore();
    const bar2 = score.tracks.map(t => t.measures[2]!.id);
    const model = scoreContextMenuModel({
      selection: { eventIds: [], measureIds: bar2, trackIds: [] },
      clipboard: null,
      playing: false,
      score,
    });
    expect(model.subject).toEqual({ key: 'editor.subjectBars', count: 1 });

    expect(
      scoreContextMenuModel({
        selection: { eventIds: ['a', 'b'], measureIds: [], trackIds: ['t'] },
        clipboard: null,
        playing: false,
      }).subject
    ).toEqual({ key: 'editor.subjectNotes', count: 2 });

    expect(
      scoreContextMenuModel({
        selection: { eventIds: [], measureIds: [], trackIds: ['t'] },
        clipboard: null,
        playing: false,
      }).subject
    ).toEqual({ key: 'editor.subjectTrack', count: 1 });
  });

  it('offers note paste at an empty cursor, and only reads while playing', () => {
    const selection = { eventIds: ['a'], measureIds: [], trackIds: [] };
    const clipboard = { kind: 'notes' as const, events: [], anchorTick: 0 };
    expect(
      enabled(scoreContextMenuModel({ selection, clipboard, playing: false }))
        .paste
    ).toBe(true);
    expect(
      enabled(
        scoreContextMenuModel({
          selection: emptySelection(),
          clipboard,
          playing: false,
        })
      ).paste
    ).toBe(true);
    expect(
      enabled(scoreContextMenuModel({ selection, clipboard, playing: true }))
    ).toEqual({
      copy: true,
      cut: false,
      clear: false,
      delete: false,
      paste: false,
      selectAll: true,
    });
  });
});

describe('runScoreContextAction', () => {
  it('routes cut and paste through the host prompts when given', () => {
    const store = testEditingStore(twoTrackScore());
    const note = allNotes(store.getState().score!)[0]!;
    store.getState().setSelection({
      eventIds: [note.id],
      measureIds: [],
      trackIds: [],
    });
    const asked: string[] = [];
    const prompts = {
      requestCut: () => asked.push('cut'),
      requestPaste: () => asked.push('paste'),
    };
    expect(runScoreContextAction(store, 'copy', prompts)).toBe(true);
    expect(store.getState().clipboard?.kind).toBe('notes');
    runScoreContextAction(store, 'cut', prompts);
    runScoreContextAction(store, 'paste', prompts);
    expect(asked).toEqual(['cut', 'paste']);
  });

  it('deletes and clears, and refuses a disabled entry', () => {
    const store = testEditingStore(twoTrackScore());
    const before = allNotes(store.getState().score!).length;
    const note = allNotes(store.getState().score!)[0]!;
    store.getState().setSelection({
      eventIds: [note.id],
      measureIds: [],
      trackIds: [],
    });

    store.setTransport('playing');
    expect(runScoreContextAction(store, 'delete')).toBe(false);
    expect(allNotes(store.getState().score!).length).toBe(before);

    store.setTransport('stopped');
    expect(runScoreContextAction(store, 'delete')).toBe(true);
    expect(allNotes(store.getState().score!).length).toBe(before - 1);

    expect(runScoreContextAction(store, 'selectAll')).toBe(true);
    expect(store.getState().selection.eventIds.length).toBe(before - 1);
  });

  it('falls back to the store actions with no prompts', () => {
    const store = testEditingStore(twoTrackScore());
    const note = allNotes(store.getState().score!)[0]!;
    store.getState().setSelection({
      eventIds: [note.id],
      measureIds: [],
      trackIds: [],
    });
    runScoreContextAction(store, 'cut');
    expect(store.getState().clipboard?.kind).toBe('notes');
    expect(store.getState().selection.eventIds).toEqual([]);
  });
});
