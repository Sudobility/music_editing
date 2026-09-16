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
 * The contract (`EditingCopy`, `COMMAND_LABEL_KEYS`, `REFUSED_EDITS`) is
 * vocabulary and lives in music_types; this module holds the one table in force.
 *
 * The host sets this once at bootstrap, exactly as it sets `setLibraryMessages`
 * and `setErrorLogging`. Before it does, every label is empty — deliberately,
 * not English: a missing label then shows as nothing at all, which is visible
 * in review, where a plausible English default would ship silently in a Chinese
 * build and look like a translation someone forgot.
 */

import type { CommandLabelKey, EditingCopy } from '@sudobility/music_types';

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
