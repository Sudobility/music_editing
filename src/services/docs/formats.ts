/**
 * Every file format the app reads and writes, declared once.
 *
 * The documentation, and anything else that has to list them, reads this —
 * rather than a paragraph of prose naming formats, which is a copy of the list
 * that stops being true the first time a format is added.
 *
 * **Here rather than in an app because both of them document these formats**,
 * and what this product can open is a fact about the product, not about a web
 * page. It sits beside `docs-content.ts` for the same reason that does: two
 * apps render this documentation, and a second copy of the list would be the
 * thing that goes stale.
 *
 * Every description is an i18n key, so the prose lives in each host's locale
 * files and the library holds no strings in any language.
 */

export type FormatEntry = {
  id: string;
  /** Extensions as a reader would write them. */
  extensions: string;
  /** i18n key describing what survives the trip. */
  noteKey: string;
};

export const IMPORT_FORMATS: readonly FormatEntry[] = [
  { id: 'midi', extensions: '.mid, .midi', noteKey: 'docs.formats.in.midi' },
  {
    id: 'musicxml',
    extensions: '.musicxml, .xml',
    noteKey: 'docs.formats.in.musicxml',
  },
  {
    id: 'tracker',
    extensions: '.mod, .dsm, .s3m, .xm, .it, .mptm',
    noteKey: 'docs.formats.in.tracker',
  },
  {
    id: 'audio',
    extensions: '.wav, .mp3, .mpa',
    noteKey: 'docs.formats.in.audio',
  },
  { id: 'project', extensions: '.json', noteKey: 'docs.formats.in.project' },
];

export const EXPORT_FORMATS: readonly FormatEntry[] = [
  { id: 'midi', extensions: '.mid', noteKey: 'docs.formats.out.midi' },
  {
    id: 'musicxml',
    extensions: '.musicxml',
    noteKey: 'docs.formats.out.musicxml',
  },
  { id: 'xm', extensions: '.xm', noteKey: 'docs.formats.out.tracker' },
  { id: 'wav', extensions: '.wav', noteKey: 'docs.formats.out.wav' },
  { id: 'mp3', extensions: '.mp3', noteKey: 'docs.formats.out.mp3' },
  { id: 'project', extensions: '.json', noteKey: 'docs.formats.out.project' },
  { id: 'print', extensions: '—', noteKey: 'docs.formats.out.print' },
];
