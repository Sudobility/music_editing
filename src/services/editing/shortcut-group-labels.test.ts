import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS } from '@sudobility/music_types';
import { shortcutGroupLabelKey } from './shortcut-table.js';

describe('shortcut group label keys', () => {
  it('names every shortcut group under docs.shortcuts.group', () => {
    // The native shortcuts screen read `shortcuts.<group>`, a key neither
    // locale has, and so printed the key as its heading.
    for (const group of SHORTCUT_GROUPS)
      expect(shortcutGroupLabelKey(group)).toBe(
        `docs.shortcuts.group.${group}`
      );
  });
});
