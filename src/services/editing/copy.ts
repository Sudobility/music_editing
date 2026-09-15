/**
 * The words an edit is described in, supplied by the host application.
 *
 * Editing moved into this library so a second app cannot reimplement it
 * differently — but an edit still has to be *named*, in the undo history and in
 * the occasional toast, and this library holds no user-facing strings in any
 * language. Same split the commands themselves already use: a command takes its
 * label as an argument, because the same command is "Add note" here and
 * something else in another locale.
 *
 * The host sets this once at bootstrap, exactly as it sets `setLibraryMessages`
 * and `setErrorLogging`. Before it does, every label is empty — deliberately,
 * not English: a missing label then shows as nothing at all, which is visible
 * in review, where a plausible English default would ship silently in a Chinese
 * build and look like a translation someone forgot.
 */

/**
 * One key per command, named for the command rather than its wording.
 *
 * An array with the type read off it, not a bare union: a host has to prove
 * every one of these has a translation, and a union has no runtime form to
 * walk. Both apps' undo histories printed raw keys for labels nobody had
 * written — the web for eleven commands, the native app for all but four —
 * because nothing could enumerate what was needed.
 */
export const COMMAND_LABEL_KEYS = [
  'addNote',
  'addMeasure',
  'addTrack',
  'changeAccidental',
  'changeArticulation',
  'changeDuration',
  'changeDynamic',
  'changePitch',
  'changeClef',
  'changeKeySignature',
  'changeRepeats',
  'changeMetadata',
  'changeTempo',
  'changeTimeSignature',
  'changeTrackProps',
  'changeVelocity',
  'deleteEvents',
  'changeVoice',
  'clearBars',
  'clearTrack',
  'deleteMeasure',
  'deleteTrack',
  'importScore',
  'insertWithRipple',
  'moveNotes',
  'pasteEvents',
  'pasteBars',
  'pasteTrack',
  'quantize',
  'relocateNotes',
  'resizeNotes',
  'setChordSymbol',
  'setFingering',
  'setPickup',
  'setLyric',
  'toGraceNote',
  'changeBeam',
  'changeBarline',
  'changeMeasureClef',
  'changeNavigation',
  'changeOrnament',
  'toggleArpeggiate',
  'toggleGlissando',
  'toggleOttava',
  'toggleFermata',
  'toggleHairpin',
  'toggleSlur',
  'toggleTie',
  'transpose',
] as const;

export type CommandLabelKey = (typeof COMMAND_LABEL_KEYS)[number];

export type EditingCopy = {
  /**
   * What each command is called in the undo history.
   *
   * A resolver rather than a snapshot: labels are read at dispatch time, so the
   * label stored in history is the one the edit was actually made under — which
   * is what you want when reading back what you did, and what a table captured
   * at bootstrap would get wrong the moment somebody switches language.
   */
  commandLabel: (key: CommandLabelKey) => string;
  /**
   * An edit introduced a validation error that was not there before.
   *
   * A function rather than a string because it has to carry the validator's own
   * account of what went wrong, and where that detail sits in the sentence is a
   * question about the language, not about the edit.
   */
  validationProblem: (detail: string) => string;
  /** Refusing to delete a track's only measure. */
  lastMeasureKept: string;
  /**
   * A note the instrument cannot play was refused.
   *
   * Facts rather than a sentence: the pitch, the instrument, its compass, which
   * side of it the note fell and what was being attempted. Every one of those
   * used to be spliced into an English string here, so a Chinese reader was
   * told in English why the note they played did not appear — and the order
   * of the parts ("C2 is below Violin's range") is itself a fact about English.
   */
  outOfRange: (detail: OutOfRangeCopy) => string;
  /** A chord was refused because the instrument plays fewer notes at once. */
  tooManyNotes: (detail: PolyphonyCopy) => string;
  /**
   * The label on a toast's Undo button.
   *
   * Offered where a refusal leaves somebody's music only in the undo history —
   * a paste refused after a cut, whose notes are no longer anywhere else.
   */
  undoAction: () => string;
};

/**
 * What an edit that was refused had been about to do.
 *
 * The tail of the sentence — "so it was not added", "so nothing was pasted" —
 * and a closed list so a host's copy table fails to compile when a new route
 * starts refusing, rather than printing a key.
 */
export const REFUSED_EDITS = [
  'addNote',
  'addChord',
  'changeNote',
  'changeAccidental',
  'moveNote',
  'moveNotes',
  'transpose',
  'paste',
] as const;

export type RefusedEdit = (typeof REFUSED_EDITS)[number];

/** Which side of an instrument's compass a refused pitch fell. */
export type RangeDirection = 'above' | 'below';

export type OutOfRangeCopy = {
  /** The refused sounding pitch, written as `pitchToString` writes it: `C#2`. */
  pitch: string;
  /** The track's instrument name, as the catalogue spells it. */
  instrument: string;
  /** The compass's lowest and highest sounding pitches, written the same way. */
  low: string;
  high: string;
  direction: RangeDirection;
  refused: RefusedEdit;
};

export type PolyphonyCopy = {
  /** `null` when the target track could not be resolved. */
  instrument: string | null;
  /** How many notes the instrument plays at once; 1 is a monophonic part. */
  limit: number;
  refused: RefusedEdit;
};

let copy: EditingCopy = {
  commandLabel: () => '',
  validationProblem: () => '',
  lastMeasureKept: '',
  outOfRange: () => '',
  tooManyNotes: () => '',
  undoAction: () => '',
};

/** Called once at bootstrap by the host application. */
export function setEditingCopy(next: EditingCopy): void {
  copy = next;
}

export function commandLabel(key: CommandLabelKey): string {
  return copy.commandLabel(key);
}

export function editingCopy(): EditingCopy {
  return copy;
}
