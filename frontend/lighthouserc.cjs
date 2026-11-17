// Lighthouse CI: audits a seeded game board (see lighthouse/run.sh, which sets LHCI_URL).
// Lighthouse's default mobile emulation, since phones are where the board is tightest.
module.exports = {
  ci: {
    collect: {
      url: [process.env.LHCI_URL],
      // The median of three runs, so one noisy run doesn't fail the build.
      numberOfRuns: 3,
    },
    // Ratcheted floors: each is the current score, and may only go up. Judged on the median run —
    // the default takes the best of the three, which would hide a regression in the other two.
    assert: {
      assertions: {
        // TODO: pin at the score CI's runners reach (a laptop scores 1). Until then, a margin.
        'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 1, aggregationMethod: 'median-run' }],
        // TODO: raise to 1. Missing: the chat stream answers 500 when the chat service is not running.
        'categories:best-practices': ['error', { minScore: 0.96, aggregationMethod: 'median-run' }],
      },
    },
    upload: {
      // Kept on the runner and uploaded as a build artifact, not to Google's public report storage.
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
