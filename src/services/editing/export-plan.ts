/**
 * What an export writes, decided before anything is written.
 *
 * Both apps offer the same menu of formats and each spelled it out: the web as
 * six handlers in `AppLayout`, each pairing a scope, a target score and a
 * filename; the native app as its own `EXPORT_FORMATS` and extension table.
 * The formats, their extensions, their labels and the choice of which score a
 * scope means are facts about the product, so they are here once — and the
 * docs table of export formats is derived from the same list, so the menu and
 * the documentation cannot come to disagree.
 *
 * What stays with the host is everything platform- or package-bound: the
 * filename rule (`exportFilename`, in music_codecs, which this package may not
 * import), rendering audio (music_player), fitting a tracker module
 * (music_lib's `scoreToTracker`) and the write itself (music_io). `route` says
 * which of those a format needs.
 */
import type { Score } from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import { exportTargetScore } from './editing.js';

/**
 * How a format reaches disk.
 *
 * `notation` is a single codec call; `tracker` has a fit report to show first;
 * `audio` has to be rendered by a synth before it is encoded; `project` writes
 * the document itself.
 */
export type ExportRoute = 'notation' | 'tracker' | 'audio' | 'project';

export const WRITABLE_EXPORT_FORMATS = [
  {
    id: 'midi',
    extension: 'mid',
    route: 'notation',
    labelKey: 'editor.midi',
    noteKey: 'docs.formats.out.midi',
  },
  {
    id: 'musicxml',
    extension: 'musicxml',
    route: 'notation',
    labelKey: 'editor.musicXml',
    noteKey: 'docs.formats.out.musicxml',
  },
  {
    id: 'xm',
    extension: 'xm',
    route: 'tracker',
    labelKey: 'editor.xmModule',
    noteKey: 'docs.formats.out.tracker',
  },
  {
    id: 'wav',
    extension: 'wav',
    route: 'audio',
    labelKey: 'editor.audioWav',
    noteKey: 'docs.formats.out.wav',
  },
  {
    id: 'mp3',
    extension: 'mp3',
    route: 'audio',
    labelKey: 'editor.audioMp3',
    noteKey: 'docs.formats.out.mp3',
  },
  {
    id: 'project',
    extension: 'json',
    route: 'project',
    labelKey: 'editor.projectJson',
    noteKey: 'docs.formats.out.project',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  extension: string;
  route: ExportRoute;
  labelKey: string;
  noteKey: string;
}>;

export type WritableExportFormat = (typeof WRITABLE_EXPORT_FORMATS)[number];
export type ExportFormatId = WritableExportFormat['id'];

/** Which tracks an export covers; see `exportScopeNeedsPrompt` for when to ask. */
export type ExportScope = 'all' | 'visible';

export type ExportPlan = {
  format: ExportFormatId;
  extension: string;
  route: ExportRoute;
  /** The score to write — already narrowed to the scope. */
  target: Score;
  /**
   * What the file is named after: the score's own title, not a project or
   * document name. Hand it to `exportFilename`, which keeps it and replaces
   * only the characters a filesystem refuses.
   */
  title: string;
};

/**
 * The plan for writing `format` at `scope`, or null with no score.
 *
 * A project file ignores the scope: it *is* the document, and hiding a track
 * is a view preference — saving the project must not throw a part away.
 */
export function planExport<T extends EditingState>(
  store: EditingStoreApi<T>,
  format: ExportFormatId,
  scope: ExportScope
): ExportPlan | null {
  const entry = WRITABLE_EXPORT_FORMATS.find(f => f.id === format);
  if (!entry) return null;
  const target = exportTargetScore(
    store,
    entry.route === 'project' ? 'all' : scope
  );
  if (!target) return null;
  return {
    format: entry.id,
    extension: entry.extension,
    route: entry.route,
    target,
    title: target.metadata.title,
  };
}
