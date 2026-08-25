import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No jsdom: the editing engine touches no DOM. That it does not need one
    // is part of what makes it usable from a native app.
    environment: 'node',
    globals: false,
    // Node's ESM loader is stricter than what the sibling packages are built
    // for — extensionless relative imports, the house style — so vitest hands
    // them to Vite rather than to Node.
    server: { deps: { inline: [/@sudobility\//] } },
  },
});
