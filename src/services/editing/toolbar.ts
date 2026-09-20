/**
 * The editing bar's rules: when each control is available, and what the few
 * controls that are more than one call actually do.
 *
 * Both apps draw this bar control for control, and both had written out the
 * same availability by hand — `canEdit && selection.eventIds.length < 2` and
 * so on, thirty times each. They agreed only because the native bar was copied
 * from the web one on a day nobody had changed either; the first control added
 * to one of them would have been the first place they disagreed about when a
 * glissando can be written. So the rules are stated here and each bar draws
 * them.
 *
 * Nothing here draws or names anything: availability is a boolean per control,
 * and every label or hint is an i18n key the host translates.
 */
import type {
  AddTrackChoice,
  AddTrackChoiceOption,
  EditMode,
  EditorMoreAction,
  QuantizeGrid,
  ToolbarAvailability,
  UUID,
} from '@sudobility/music_types';
import {
  EDITOR_MORE_ACTIONS,
  EDIT_MODE_OPTIONS,
  TOOLBAR_CONTROLS,
  isVocalInstrumentValue,
} from '@sudobility/music_types';
import { indexOfBarNumber, ticksFor } from '@sudobility/music_types';
import { getMusicPositionSource } from '@sudobility/music_types';
import type {
  EditingState,
  EditingStoreApi,
} from '../../store/editing-store.js';
import {
  selectActiveTrackId,
  selectCanStack,
  selectSelectedNotes,
  selectSelectedTrack,
} from '../../store/selectors.js';
import {
  addBlankTrack,
  addMeasure,
  defaultInsertPitch,
  deleteMeasureAtCaret,
  insertNoteAtCaret,
  quantizeSelection,
  selectAll,
  toggleGlissando,
} from './editing.js';

function computeAvailability(state: EditingState): ToolbarAvailability {
  const hasScore = state.score !== null;
  const playing = state.state === 'playing';
  /*
    Content is immutable while the transport plays (`score-slice`'s edit lock),
    so every control that would dispatch a content command says so rather than
    looking live and doing nothing.
  */
  const canEdit = hasScore && !playing;
  const notes = state.selection.eventIds.length;
  /*
    Bars count as a selection here, as they do for the accidental and quantize
    commands: selecting three bars and choosing a sharp is a real edit. The
    marks below count *notes*, because a slur over "bars 3 to 5" is not
    something the command knows how to place.
  */
  const hasSelection = notes > 0 || state.selection.measureIds.length > 0;
  const selectedNotes = selectSelectedNotes(state);
  const selectedTrack = selectSelectedTrack(state);
  const selectedTrackIsVoice =
    selectedTrack !== null &&
    isVocalInstrumentValue(String(selectedTrack.midiProgram)) &&
    selectedNotes.length > 0 &&
    selectedNotes.every(note => note.trackId === selectedTrack.id);

  return {
    addTrack: canEdit,
    // Choosing a length also arms the next note, which is useful while
    // listening; the store refuses the retime itself during playback.
    noteDuration: hasScore,
    dotted: hasScore,
    triplet: hasScore,
    accidental: canEdit && hasSelection,
    articulation: canEdit && hasSelection,
    ornament: canEdit && hasSelection,
    tie: canEdit && hasSelection,
    insertMode: hasScore,
    replaceMode: hasScore,
    stackMode: hasScore && selectCanStack(state),
    insertNote: canEdit,
    // A span needs two notes — a phrase mark or a wedge over one has nowhere
    // to go — and a mark that sits on a note needs one.
    slur: canEdit && notes >= 2,
    crescendo: canEdit && notes >= 2,
    diminuendo: canEdit && notes >= 2,
    arpeggiate: canEdit && notes >= 1,
    beamBreak: canEdit && notes >= 1,
    beamNone: canEdit && notes >= 1,
    fermata: canEdit && notes >= 1,
    noteInput: canEdit,
    insertRest: canEdit,
    quantizeGrid: hasScore,
    quantize: canEdit && hasSelection,
    voice: hasScore,
    moreActions: hasScore,
    // Selecting reads the score, and going to a bar moves only the caret.
    selectAll: hasScore,
    goToBar: hasScore,
    /*
      Locked while playing, which the web bar did not do and the native one
      did: lyrics, bars and a slide are all content, and a control that opens
      an entry bar whose every keystroke the store then refuses is a control
      that invites typing into nothing.
    */
    addMeasure: canEdit,
    deleteMeasure: canEdit,
    enterLyrics: canEdit && selectedTrackIsVoice,
    glissando: canEdit && notes >= 2,
  };
}

let lastAvailability: ToolbarAvailability | null = null;

/**
 * Which editing-bar controls can be used right now.
 *
 * Reference-stable while no answer changes, because it is meant to be handed
 * straight to a store hook: a fresh object per call would re-render the bar on
 * every store write, zoom and caret included.
 */
export function selectToolbarAvailability(
  state: EditingState
): ToolbarAvailability {
  const next = computeAvailability(state);
  if (
    lastAvailability &&
    TOOLBAR_CONTROLS.every(c => lastAvailability![c] === next[c])
  )
    return lastAvailability;
  lastAvailability = next;
  return next;
}

/**
 * The hint an edit-mode button shows.
 *
 * Stack has a second form for a track that cannot stack, which says why the
 * button is off rather than describing a mode the reader cannot have. That
 * form takes the instrument's name (`{ instrument }`); the host supplies it.
 */
export function editModeHintKey(mode: EditMode, canStackHere: boolean): string {
  if (mode === 'stack' && !canStackHere) return 'editor.stackModeUnavailable';
  return (
    EDIT_MODE_OPTIONS.find(option => option.value === mode)?.hintKey ??
    `editor.${mode}ModeHint`
  );
}

/** The hint for a voice button, counted from 0 like `activeVoiceIndex`. */
export function voiceHintKey(voiceIndex: number): string {
  return `editor.voice${voiceIndex + 1}Hint`;
}

/**
 * Insert Note: the default pitch, at the caret, and step past it.
 *
 * Advancing is a product decision both apps now share — the web bar wrote the
 * note and left the caret on it, so a second press stacked onto the first
 * instead of continuing the line.
 */
export function insertDefaultNoteAtCaret<T extends EditingState>(
  store: EditingStoreApi<T>
): void {
  insertNoteAtCaret(store, defaultInsertPitch(store), { advanceCaret: true });
}

/**
 * Quantize the selection onto one of the bar's grids.
 *
 * Starts and lengths both, which is what the single Quantize button has always
 * meant; the grid is named rather than given in ticks so the bar never has to
 * know the score's resolution.
 */
export async function quantizeSelectionToGrid<T extends EditingState>(
  store: EditingStoreApi<T>,
  grid: QuantizeGrid
): Promise<void> {
  const score = store.getState().score;
  if (!score) return;
  await quantizeSelection(store, {
    grid: ticksFor(grid, score.ppq),
    quantizeStarts: true,
    quantizeDurations: true,
  });
}

/**
 * Go to bar, from what was typed.
 *
 * By the number a reader sees, which is not an index: a pickup has no number,
 * so on a score with one, bar 1 is the *second* measure. Both prompts used to
 * go through `caretToBar` (since removed), which counted `index + 1` and so landed one bar
 * early on every score with an anacrusis — the one place left that disagreed
 * with the number drawn in the gutter.
 *
 * `false` for blank text, a non-number and a bar that does not exist, which is
 * what keeps the prompt open to say so.
 */
export function goToBarFromInput<T extends EditingState>(
  store: EditingStoreApi<T>,
  text: string
): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  const bar = Number(trimmed);
  if (!Number.isFinite(bar)) return false;
  const measures = store.getState().score?.tracks[0]?.measures;
  if (!measures) return false;
  const index = indexOfBarNumber(measures, Math.round(bar));
  const measure = index === null ? undefined : measures[index];
  if (!measure) return false;
  getMusicPositionSource().moveTo(measure.startTick);
  return true;
}

/**
 * The two ways to add a track, in the order both bars offer them.
 *
 * Generate is disabled rather than dropped where there is nowhere to send it —
 * a local document with no server — so the reader learns where it lives and
 * the hint can say why it is off; a menu whose entries come and go teaches
 * nothing.
 */
export function addTrackChoices(options: {
  canGenerate: boolean;
}): AddTrackChoiceOption[] {
  return [
    {
      value: 'blank',
      labelKey: 'editor.blankTrack',
      hintKey: 'editor.blankTrackHint',
      disabled: false,
    },
    {
      value: 'generate',
      labelKey: 'editor.generateTrack',
      hintKey: options.canGenerate
        ? 'editor.generateTrackHint'
        : 'editor.generateTrackUnavailable',
      disabled: !options.canGenerate,
    },
  ];
}

/**
 * Act on an add-track answer.
 *
 * Both answers add content, so both are refused while the transport plays —
 * the trigger is disabled then, but a menu or sheet can outlive the moment
 * playback started under it.
 */
export function runAddTrackChoice<T extends EditingState>(
  store: EditingStoreApi<T>,
  choice: AddTrackChoice,
  host: { generateTrack?: () => void }
): UUID | null {
  if (!selectToolbarAvailability(store.getState()).addTrack) return null;
  if (choice === 'blank') return addBlankTrack(store);
  host.generateTrack?.();
  return null;
}

/**
 * Run a More-menu entry, unless it is unavailable.
 *
 * The two that open something — a Go to bar prompt, the lyric entry bar — are
 * the host's, since only it has a prompt to open.
 */
export function runMoreAction<T extends EditingState>(
  store: EditingStoreApi<T>,
  action: EditorMoreAction,
  host: {
    addMeasure?: () => void;
    goToBar?: () => void;
    enterLyrics?: () => void;
  }
): void {
  const entry = EDITOR_MORE_ACTIONS.find(a => a.value === action);
  if (!entry || !selectToolbarAvailability(store.getState())[entry.control])
    return;
  if (action === 'select-all') selectAll(store);
  else if (action === 'add-measure') {
    if (host.addMeasure) host.addMeasure();
    else addMeasure(store);
  } else if (action === 'delete-measure') deleteMeasureAtCaret(store);
  else if (action === 'go-to-bar') host.goToBar?.();
  else if (action === 'enter-lyrics') host.enterLyrics?.();
  else toggleGlissando(store);
}

/**
 * Whether the active-track picker is shown at all.
 *
 * With fewer than two tracks there is nothing to choose between and nothing
 * that could be hidden, so it would be a permanently disabled control taking
 * width on the widest bar in the app.
 */
export function trackPickerVisible(state: EditingState): boolean {
  return (
    (state.score?.tracks.length ?? 0) >= 2 &&
    selectActiveTrackId(state) !== null
  );
}
