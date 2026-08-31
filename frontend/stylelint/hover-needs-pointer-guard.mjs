import stylelint from 'stylelint';

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = 'keezen/hover-needs-pointer-guard';

const messages = ruleMessages(ruleName, {
  rejected: (selector) =>
    `Wrap "${selector}" in @media (hover: hover) and (pointer: fine). ` +
    'On a touch device there is no pointer that can leave an element, so after a tap the browser ' +
    'keeps :hover applied until something else is tapped ("sticky hover") — a lift or scale then ' +
    'reads as selection state that never clears. Use :active for press feedback on touch.',
});

const meta = {
  url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover',
};

/** A guard is any ancestor @media that requires a real hovering pointer. */
const isHoverGuard = (node) =>
  node.type === 'atrule' && node.name === 'media' && /\bhover\s*:\s*hover\b/.test(node.params);

const isGuarded = (rule) => {
  for (let node = rule.parent; node; node = node.parent) {
    if (isHoverGuard(node)) return true;
  }
  return false;
};

const ruleFunction = (primary) => (root, result) => {
  if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) return;

  root.walkRules((rule) => {
    if (!rule.selector.includes(':hover') || isGuarded(rule)) return;

    report({
      result,
      ruleName,
      message: messages.rejected(rule.selector),
      node: rule,
      word: ':hover',
    });
  });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default createPlugin(ruleName, ruleFunction);
