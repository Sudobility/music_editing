/**
 * This package is editing, and only editing.
 *
 * The player binding, export planning, the documentation content, the
 * unsaved-work guard and the theme went to music_lib; the lit-keys rule went to
 * music_drawing, beside the keyboard it lights; and every closed vocabulary and
 * shared type went to music_types. music_lib re-exports this package and
 * music_types wholesale, so a name exported from here again reaches it by two
 * routes — a TS2308 in its build and a "Cannot redefine property" crash in any
 * CommonJS consumer — and a module back here is a responsibility back here.
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import * as editing from './index.js';

const MOVED = [
  // to music_lib
  'bindPlayer',
  'PlayerBinding',
  'BindPlayerOptions',
  'TRANSPORT_SETTINGS_DEFAULTS',
  'DOCS_TOPICS',
  'docsTopic',
  'docsGroupLabelKey',
  'RESOURCE_GROUPS',
  'hostOf',
  'monogramFor',
  'decideClose',
  'decideQuit',
  'hasUnwrittenWork',
  'planExport',
  'resolveThemeMode',
  // to music_drawing
  'litKeys',
  'samePitchSet',
  'playingPitchesForTrack',
  // to music_types
  'IMPORT_FORMATS',
  'EXPORT_FORMATS',
  'FormatEntry',
  'WRITABLE_EXPORT_FORMATS',
  'WritableExportFormat',
  'ExportFormatId',
  'ExportRoute',
  'ExportScope',
  'ExportPlan',
  'DOCS_TOPIC_IDS',
  'DocsTopicId',
  'DocsWidget',
  'DocsSubsection',
  'DocsTopic',
  'DOCS_GROUPS',
  'DocsGroup',
  'Resource',
  'ResourceGroup',
  'TransportSettings',
  'PlayerFailure',
  'THEME_MODES',
  'ThemeMode',
  'ResolvedThemeMode',
  'DevSettings',
  'EDIT_MODES',
  'EditMode',
  'EDIT_MODE_OPTIONS',
  'Toast',
  'ToastSeverity',
  'ToastAction',
  'RefusalAction',
  'PitchDisplay',
  'QUANTIZE_GRIDS',
  'QuantizeGrid',
  'QUANTIZE_GRID_SHORT',
  'INSPECTOR_TABS',
  'InspectorTab',
  'INSPECTOR_TAB_LABEL_KEY',
  'MIX_ONLY_CONTROLS',
  'MixOnlyControl',
  'MeasureClefValue',
  'TOOLBAR_CONTROLS',
  'ToolbarControl',
  'ToolbarAvailability',
  'EDITOR_MORE_ACTIONS',
  'EditorMoreAction',
  'AddTrackChoice',
  'AddTrackChoiceOption',
  'EDITOR_VOICE_COUNT',
  'SCORE_CONTEXT_ACTIONS',
  'ScoreContextAction',
  'SCORE_CONTEXT_ACTION_LABEL_KEY',
  'ScoreContextMenuEntry',
  'ScoreContextMenuModel',
  'SelectionKind',
  'ClipboardData',
  'COMMAND_LABEL_KEYS',
  'CommandLabelKey',
  'REFUSED_EDITS',
  'RefusedEdit',
  'RangeDirection',
  'OutOfRangeCopy',
  'PolyphonyCopy',
  'EditingCopy',
  'ShortcutRow',
  'SHORTCUT_GROUPS',
  'ShortcutGroup',
  'LyricEntryState',
  'LyricInput',
  'LyricWrite',
  'LyricStep',
  'KeyGroup',
  'ReleaseResult',
  'ScoreHit',
  'ScoreCanvasHit',
  'ScorePressModifiers',
  'PointerGesture',
  'PointerKind',
  'PressKind',
  'PitchChange',
  'EditorKeyChord',
  'ReplaceSubmission',
  'PreparedReplacement',
  'TrackMixPatch',
  'ScoreMetadataPatch',
  // music_types' own, once re-exported from the selectors
  'barBeatForTick',
  'BarBeat',
  // deleted, not moved: the structural copy of the player's methods the binder
  // needed while it lived here. music_lib's binder takes `IMusicPlayer` itself.
  'BindablePlayer',
];

describe('names that moved out of music_editing', () => {
  it('are not exported at runtime', () => {
    expect(MOVED.filter(name => name in editing)).toEqual([]);
  });

  it('are neither declared nor re-exported by any source file', () => {
    const offenders: string[] = [];
    for (const file of globSync('src/**/*.ts')) {
      if (file.includes('.test.')) continue;
      const text = readFileSync(file, 'utf8');
      for (const name of MOVED) {
        const declared = new RegExp(
          `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:type|interface|const|class|function|enum)\\s+${name}\\b`
        );
        const reexported = new RegExp(
          `export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}`
        );
        if (declared.test(text) || reexported.test(text))
          offenders.push(`${name} in ${file}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('holds no playback, docs, documents, export-plan or theme module', () => {
    expect(
      globSync('src/services/{playback,docs,documents}/**/*.ts').concat(
        globSync(
          'src/services/editing/{export-plan,theme-mode,playing-pitches}.ts'
        )
      )
    ).toEqual([]);
  });

  it('keeps no theme or developer settings in the editing state', () => {
    const state = editing.createEditingStore().getState() as unknown as Record<
      string,
      unknown
    >;
    for (const key of [
      'themeMode',
      'setThemeMode',
      'developerMode',
      'setDeveloperMode',
      'devSettings',
      'setDevSettings',
    ])
      expect(key in state, key).toBe(false);
    // Note entry inverts the written-pitch lens, so this one stays.
    expect('pitchDisplay' in state).toBe(true);
  });
});
