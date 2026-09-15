import { describe, expect, it } from 'vitest';
import { twoTrackScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import { EXPORT_FORMATS } from '../docs/formats.js';
import { WRITABLE_EXPORT_FORMATS, planExport } from './export-plan.js';

describe('WRITABLE_EXPORT_FORMATS', () => {
  it('is what the docs export table lists, plus printing', () => {
    // The docs table used to be its own list; a format added to the export
    // menu then went undocumented until somebody noticed.
    expect(EXPORT_FORMATS.map(f => f.id)).toEqual([
      ...WRITABLE_EXPORT_FORMATS.map(f => f.id),
      'print',
    ]);
    for (const format of WRITABLE_EXPORT_FORMATS) {
      const row = EXPORT_FORMATS.find(f => f.id === format.id)!;
      expect(row.extensions).toBe(`.${format.extension}`);
    }
  });

  it('labels every format with a key, never a word', () => {
    for (const format of WRITABLE_EXPORT_FORMATS)
      expect(format.labelKey).toMatch(/^[a-z]+\.[A-Za-z0-9]+$/);
  });
});

describe('planExport', () => {
  it('is null with no score', () => {
    expect(planExport(testEditingStore(), 'midi', 'all')).toBeNull();
  });

  it('writes every track for the whole score', () => {
    const store = testEditingStore(twoTrackScore());
    const plan = planExport(store, 'midi', 'all')!;
    expect(plan.target).toBe(store.getState().score);
    expect(plan).toMatchObject({
      format: 'midi',
      extension: 'mid',
      route: 'notation',
    });
    expect(plan.title).toBe(store.getState().score!.metadata.title);
  });

  it('drops hidden tracks for a visible-only export', () => {
    const store = testEditingStore(twoTrackScore());
    const [first] = store.getState().score!.tracks;
    store.getState().setVisibleTracks([first.id]);
    const plan = planExport(store, 'wav', 'visible')!;
    expect(plan.route).toBe('audio');
    expect(plan.target.tracks.map(t => t.id)).toEqual([first.id]);
  });

  it('routes a module through the fit report and a project past the scope', () => {
    const store = testEditingStore(twoTrackScore());
    const [first] = store.getState().score!.tracks;
    store.getState().setVisibleTracks([first.id]);
    expect(planExport(store, 'xm', 'all')!.route).toBe('tracker');
    // A project file is the document, not a rendering of it: hiding a track
    // is a view preference, and saving must not throw a part away.
    const project = planExport(store, 'project', 'visible')!;
    expect(project.route).toBe('project');
    expect(project.target.tracks).toHaveLength(2);
  });
});
