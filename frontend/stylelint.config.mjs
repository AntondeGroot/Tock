// Stylelint runs one rule on purpose: the pointer guard on :hover (see stylelint/). Formatting is
// Prettier's job and the rest of the stylesheet conventions aren't gated yet — adopting
// stylelint-config-standard-scss today reports ~600 pre-existing violations, so it belongs in its
// own ratcheted step (measure, freeze, climb) rather than turning this gate red on arrival.
// TODO: extend stylelint-config-standard-scss, disabling what the codebase doesn't meet yet.
export default {
  customSyntax: 'postcss-scss',
  plugins: ['./stylelint/hover-needs-pointer-guard.mjs'],
  rules: {
    'keezen/hover-needs-pointer-guard': true,
  },
};
