import { defineConfig } from 'vitest/config';

// Shared by both test targets (angular.json `runnerConfig`).
export default defineConfig({
  test: {
    // Vitest keeps transformed modules in node_modules/.vitest-cache and reuses them between runs.
    // Behind Angular's test builder it does not notice when a file a spec IMPORTS changes, so a
    // rerun quietly tested the previous code — a broken library file still passed, and a fixed one
    // still failed. Correct results matter more than the fraction of a second it saved.
    fsModuleCache: false,
  },
});
