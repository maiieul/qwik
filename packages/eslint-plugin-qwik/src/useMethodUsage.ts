/* eslint-disable no-console */
import type { QwikEslintExamples } from '../examples';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const useMethodUsage: TSESLint.RuleModule<'useWrongFunction', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect invalid use of use hooks.',
      recommended: 'recommended',
      url: 'https://qwik.builder.io/docs/advanced/eslint/#use-method-usage',
    },
    schema: [],
    messages: {
      useWrongFunction: 'Calling use* methods in wrong function.',
    },
  },
  create(context) {
    const modifyJsxSource = context.sourceCode
      .getAllComments()
      .some((c) => c.value.includes('@jsxImportSource'));
    if (modifyJsxSource) {
      return {};
    }
    return {
      'CallExpression[callee.name=/^use[A-Z]/]'(node: TSESTree.Node) {
        const parent = node.parent;
        while (parent) {
          const type = parent.type;
          switch (type) {
            case 'VariableDeclarator':
            case 'VariableDeclaration':
            case 'ExpressionStatement':
            case 'MemberExpression':
            case 'BinaryExpression':
            case 'UnaryExpression':
            case 'ReturnStatement':
            case 'BlockStatement':
            case 'ChainExpression':
            case 'Property':
            case 'ObjectExpression':
            case 'CallExpression':
            case 'TSAsExpression':
              break;
            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
              if (parent.parent.type === 'VariableDeclarator') {
                if (
                  parent.parent.id?.type === 'Identifier' &&
                  parent.parent.id.name.startsWith('use')
                ) {
                  return;
                }
              }
              if (parent.parent.type === 'CallExpression') {
                if (
                  parent.parent.callee.type === 'Identifier' &&
                  parent.parent.callee.name === 'component$'
                ) {
                  return;
                }
              }
              context.report({
                node,
                messageId: 'useWrongFunction',
              });
              return;
            case 'FunctionDeclaration':
              if (!parent.id?.name.startsWith('use')) {
                context.report({
                  node,
                  messageId: 'useWrongFunction',
                });
              }
              return;
            default:
              context.report({
                node,
                messageId: 'useWrongFunction',
              });
              return;
            // ERROR
          }
        }
      },
    };
  },
};

const useWrongFunctionGood = `
export const Counter = component$(() => {
  const count = useSignal(0);
});
`.trim();

const useWrongFunctionGood2 = `
export const useCounter = () => {
  const count = useSignal(0);
  return count;
};
`.trim();

const useWrongFunctionBad = `
export const Counter = (() => {
  const count = useSignal(0);
});
`.trim();

export const useMethodUsageExamples: QwikEslintExamples = {
  useWrongFunction: {
    good: [
      {
        codeHighlight: '{2} /component$/#a',
        code: useWrongFunctionGood,
      },
      {
        codeHighlight: '{2} /component$/#a',
        code: useWrongFunctionGood2,
      },
    ],
    bad: [
      {
        codeHighlight: '{2} /component$/#a',
        code: useWrongFunctionBad,
        description:
          '`use*` methods can just be used in `component$` functions or inside `use*` hooks (e.g. `useCounter`).',
      },
    ],
  },
};
