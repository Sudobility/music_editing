/**
 * Typing through a line of lyrics, as a state machine with no input field.
 *
 * The web bar read `keydown`; the native one watched the text, because a phone
 * keyboard has no key event to cancel. Both now feed the same step, so the
 * rules — which key ends a word, which ends a syllable, what steps back — are
 * checked once here rather than twice through two renderers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findEvent,
  getMusicPositionSource,
  isNoteEvent,
  resetMusicPosition,
} from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import { testEditingStore } from '../../test/store.js';
import {
  applyLyricStep,
  beginLyricEntry,
  lyricEntryStep,
  splitLyricSeparator,
} from './lyric-entry.js';
import type { LyricEntryState } from '@sudobility/music_types';

const at = (index: number, count = 3, continuing = false): LyricEntryState => ({
  index,
  count,
  continuing,
});

describe('lyricEntryStep', () => {
  it('ends a word on space and on Tab, and moves on', () => {
    for (const input of ['space', 'tab'] as const) {
      const step = lyricEntryStep(at(0), input, ' twin ');
      expect(step.write).toEqual({
        index: 0,
        text: 'twin',
        continuing: false,
        hyphenated: false,
      });
      expect(step.state).toEqual(at(1));
      expect(step.close).toBe(false);
    }
  });

  it('ends a syllable on a hyphen, and the next one continues the word', () => {
    const first = lyricEntryStep(at(0), 'hyphen', 'beau');
    expect(first.write).toMatchObject({ hyphenated: true, continuing: false });
    expect(first.state).toEqual(at(1, 3, true));

    const second = lyricEntryStep(first.state, 'space', 'ty');
    expect(second.write).toMatchObject({ continuing: true, hyphenated: false });
    expect(second.state.continuing).toBe(false);
  });

  it('closes after the last note rather than walking off the end', () => {
    const step = lyricEntryStep(at(2), 'space', 'star');
    expect(step.write?.index).toBe(2);
    expect(step.close).toBe(true);
  });

  it('commits and stops on Enter', () => {
    const step = lyricEntryStep(at(1), 'enter', 'lit');
    expect(step.write).toMatchObject({ index: 1, text: 'lit' });
    expect(step.close).toBe(true);
  });

  it('abandons the syllable in progress on Escape', () => {
    const step = lyricEntryStep(at(1), 'escape', 'half-typed');
    expect(step.write).toBeNull();
    expect(step.close).toBe(true);
  });

  it('steps back over a typo, keeping what was typed and how it joins', () => {
    const step = lyricEntryStep(at(2, 3, true), 'back', 'kle');
    expect(step.write).toEqual({
      index: 2,
      text: 'kle',
      continuing: true,
      hyphenated: true,
    });
    expect(step.state).toEqual(at(1, 3, true));
    expect(lyricEntryStep(at(0), 'back', '').state.index).toBe(0);
  });
});

describe('splitLyricSeparator', () => {
  it('finds a hyphen anywhere, not only at the end', () => {
    expect(splitLyricSeparator('beau-')).toEqual({
      syllable: 'beau',
      separator: 'hyphen',
    });
    // Typed with the caret inside the word: still a syllable break, as a
    // hyphen key is on a hardware keyboard.
    expect(splitLyricSeparator('be-au')).toEqual({
      syllable: 'beau',
      separator: 'hyphen',
    });
  });

  it('ends a word on a space or tab, trimmed', () => {
    expect(splitLyricSeparator(' twin ')).toEqual({
      syllable: 'twin',
      separator: 'space',
    });
    expect(splitLyricSeparator('twin\t')).toEqual({
      syllable: 'twin',
      separator: 'tab',
    });
  });

  it('leaves ordinary typing alone', () => {
    expect(splitLyricSeparator('twin')).toEqual({
      syllable: 'twin',
      separator: null,
    });
  });
});

describe('beginLyricEntry and applyLyricStep', () => {
  beforeEach(() => resetMusicPosition());

  it('starts at the first note at or after the caret on the active track', () => {
    const store = testEditingStore(twinkleScore());
    getMusicPositionSource().moveTo(481);
    const entry = beginLyricEntry(store);
    expect(entry).not.toBeNull();
    expect(entry!.notes.length).toBeGreaterThan(1);
    expect(entry!.notes[entry!.startIndex]!.startTick).toBeGreaterThanOrEqual(
      481
    );
    expect(entry!.state).toEqual({
      index: entry!.startIndex,
      count: entry!.notes.length,
      continuing: false,
    });
  });

  it('does not start with no score or while playing', () => {
    expect(beginLyricEntry(testEditingStore())).toBeNull();
    const store = testEditingStore(twinkleScore());
    store.setTransport('playing');
    expect(beginLyricEntry(store)).toBeNull();
  });

  it('writes the step onto the note it names', () => {
    const store = testEditingStore(twinkleScore());
    const entry = beginLyricEntry(store)!;
    const step = lyricEntryStep(entry.state, 'hyphen', 'Twin');
    applyLyricStep(store, entry.notes, step);

    const note = findEvent(store.getState().score!, entry.notes[0]!.id);
    expect(note && isNoteEvent(note) ? note.lyric : null).toEqual({
      text: 'Twin',
      syllabic: 'begin',
    });
  });
});
