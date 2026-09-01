/**
 * Which keys count as one chord.
 *
 * A chord is keys that overlap in time, so the group closes when the **last**
 * finger lifts, not the first — release C then press E and you have two notes;
 * hold C while pressing E and you have a third.
 *
 * Here rather than in an app because **both apps have a piano keyboard and
 * both had this rule** — React Native as a module, the web inline in
 * `PianoKeyboardView`'s `pressKey`/`releaseKey` with its own shape (a
 * `{midis, firstPressAt}` object beside a `heldSince` map). Two statements of
 * "which keys count as one chord" is two chances to disagree about what the
 * player just played, and the web's was inside a component, where it could not
 * be tested without a renderer.
 *
 * What the group *becomes* is `playKeyGroup`, next door; this only decides
 * where one group ends.
 */
export type KeyGroup = {
  /** Every key touched since the first went down, in the order touched. */
  midis: readonly number[];
  /** Keys still held. Empty means the group is finished. */
  down: readonly number[];
  /** When the first key went down; 0 when no group is open. */
  startedAt: number;
};

export const EMPTY_GROUP: KeyGroup = { midis: [], down: [], startedAt: 0 };

export function pressKey(group: KeyGroup, midi: number, now: number): KeyGroup {
  return {
    startedAt:
      group.down.length === 0 && group.midis.length === 0
        ? now
        : group.startedAt,
    midis: group.midis.includes(midi) ? group.midis : [...group.midis, midi],
    down: group.down.includes(midi) ? group.down : [...group.down, midi],
  };
}

export type ReleaseResult = {
  group: KeyGroup;
  /** Set once the last finger lifts — what to hand `playKeyGroup`. */
  finished: { midis: readonly number[]; heldMs: number } | null;
};

export function releaseKey(
  group: KeyGroup,
  midi: number,
  now: number
): ReleaseResult {
  const down = group.down.filter(m => m !== midi);
  if (down.length > 0) return { group: { ...group, down }, finished: null };
  if (group.midis.length === 0) return { group: EMPTY_GROUP, finished: null };
  return {
    group: EMPTY_GROUP,
    finished: {
      midis: group.midis,
      heldMs: Math.max(0, now - group.startedAt),
    },
  };
}
