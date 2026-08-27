/**
 * This package must run unchanged on the web and in React Native.
 *
 * That is the reason it exists as a package at all: a native app wants the
 * editing engine and none of the web app around it. The claim is easy to make
 * and easy to break — one `document.` or one import of a browser-only library
 * and a native build fails at runtime, long after the commit that caused it.
 *
 * So it is checked. The source may reach for nothing the two platforms do not
 * share, and may import nothing beyond the model, the store library and its
 * own files.
 *
 * The vitest environment is `node` rather than `jsdom` for the same reason:
 * if any of this needed a DOM, the tests would fail rather than quietly
 * passing on a DOM that React Native will not provide.
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';

/** Globals a browser has and React Native does not. */
const WEB_ONLY =
  /\b(document|window|localStorage|sessionStorage|XMLHttpRequest|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|requestAnimationFrame|IntersectionObserver|ResizeObserver|Worker)\b/;

/**
 * Packages this may depend on. Anything else is a platform assumption.
 *
 * `react` is on the list and `react-dom` deliberately is not: React itself is
 * the same library on both platforms — it is the *renderer* that differs — so
 * a hook that owns an editing rule and renders nothing runs unchanged in both.
 * Anything that reaches for a DOM renderer is still rejected here.
 */
const ALLOWED_PACKAGES = new Set([
  '@sudobility/music_types',
  'react',
  '@sudobility/music_types/test',
  'zustand',
  'zustand/middleware/immer',
  'immer',
  'vitest',
  'node:fs',
]);

function sources(): string[] {
  return globSync('src/**/*.ts', { cwd: process.cwd() });
}

/**
 * The file as CODE: comments and string bodies removed.
 *
 * Both have to go. A comment explaining what a "document" store is, and a test
 * named `'gives each document its own history'`, are prose about the word —
 * not a reach for the browser global — and matching them would make this guard
 * cry wolf until somebody deleted it.
 */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('platform independence', () => {
  it('touches no global that React Native does not have', () => {
    const offenders = sources()
      .filter(f => !f.endsWith('platform-free.test.ts'))
      .flatMap(file => {
        const match = WEB_ONLY.exec(codeOf(file));
        return match ? [`${file}: ${match[1]}`] : [];
      });

    expect(offenders).toEqual([]);
  });

  it('imports nothing outside the model and the store library', () => {
    const offenders: string[] = [];
    // This file's own regex literals name imports; it is the checker, not a
    // module with dependencies of its own.
    for (const file of sources().filter(
      f => !f.endsWith('platform-free.test.ts')
    )) {
      const raw = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
      for (const [, spec] of raw.matchAll(/ from '([^']+)'/g)) {
        if (spec.startsWith('.')) continue;
        if (!ALLOWED_PACKAGES.has(spec)) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('depends on nothing web-only at the package level', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const runtime = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ];
    // react and zustand both run natively; a renderer or a DOM shim would not.
    for (const name of runtime) {
      expect(
        ['immer', 'zustand', 'react', '@sudobility/music_types'],
        `${name} is not known to work on React Native`
      ).toContain(name);
    }
  });
});
