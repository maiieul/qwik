import jsxAstUtils from 'jsx-ast-utils';
import { QwikEslintExamples } from '../examples';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { JsxAttribute, JsxElement } from 'typescript';

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

function isFunctionLikeExpression(node: TSESTree.Node) {
  return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

const defaultOptions = {
  checkFragmentShorthand: false,
  checkKeyMustBeforeSpread: false,
  warnOnDuplicates: false,
};

export const jsxKey: TSESLint.RuleModule<
  | 'missingIterKey'
  | 'missingIterKeyUsePrag'
  | 'missingArrayKey'
  | 'missingArrayKeyUsePrag'
  | 'nonUniqueKeys',
  [
    {
      checkFragmentShorthand?: boolean;
      checkKeyMustBeforeSpread?: boolean;
      warnOnDuplicates?: boolean;
    }?,
  ]
> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow missing `key` props in iterators/collection literals',
      recommended: 'recommended',
      url: 'https://qwik.builder.io/docs/advanced/eslint/#jsx-key',
    },
    messages: {
      missingIterKey: 'Missing "key" prop for element in iterator.',
      missingIterKeyUsePrag:
        'Missing "key" prop for element in iterator. The key prop allows for improved rendering performance. Shorthand fragment syntax does not support providing keys. Use <Fragment> instead',
      missingArrayKey:
        'Missing "key" prop for element in array. The key prop allows for improved rendering performance.',
      missingArrayKeyUsePrag:
        'Missing "key" prop for element in array. The key prop allows for improved rendering performance. Shorthand fragment syntax does not support providing keys. Use <Fragment> instead',
      nonUniqueKeys: '`key` prop must be unique',
    },
    schema: [
      {
        type: 'object',
        properties: {
          checkFragmentShorthand: {
            type: 'boolean',
            default: defaultOptions.checkFragmentShorthand,
          },
          checkKeyMustBeforeSpread: {
            type: 'boolean',
            default: defaultOptions.checkKeyMustBeforeSpread,
          },
          warnOnDuplicates: {
            type: 'boolean',
            default: defaultOptions.warnOnDuplicates,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const modifyJsxSource = context.sourceCode
      .getAllComments()
      .some((c) => c.value.includes('@jsxImportSource'));
    if (modifyJsxSource) {
      return {};
    }
    const options = Object.assign({}, defaultOptions, context.options[0]);
    const checkFragmentShorthand = options.checkFragmentShorthand;
    const checkKeyMustBeforeSpread = options.checkKeyMustBeforeSpread;
    const warnOnDuplicates = options.warnOnDuplicates;

    function checkIteratorElement(node: TSESTree.Expression) {
      if (
        node.type === 'JSXElement' &&
        !jsxAstUtils.hasProp(node.openingElement.attributes, 'key')
      ) {
        context.report({
          node,
          messageId: 'missingIterKey',
        });
      } else if (checkFragmentShorthand && node.type === 'JSXFragment') {
        context.report({
          node,
          messageId: 'missingIterKeyUsePrag',
        });
      }
    }

    function getReturnStatements(
      node: TSESTree.Node,
      returnStatements: TSESTree.ReturnStatement[]
    ) {
      if (node.type === 'IfStatement') {
        if (node.consequent) {
          getReturnStatements(node.consequent, returnStatements);
        }
        if (node.alternate) {
          getReturnStatements(node.alternate, returnStatements);
        }
      } else if (node.type === 'BlockStatement') {
        node.body.forEach((item) => {
          if (item.type === 'IfStatement') {
            getReturnStatements(item, returnStatements);
          }

          if (item.type === 'ReturnStatement') {
            returnStatements.push(item);
          }
        });
      }

      return returnStatements;
    }

    function isKeyAfterSpread(attributes: TSESTree.Node[]) {
      let hasFoundSpread = false;
      return attributes.some((attribute) => {
        if (attribute.type === 'JSXSpreadAttribute') {
          hasFoundSpread = true;
          return false;
        }
        if (attribute.type !== 'JSXAttribute') {
          return false;
        }
        return hasFoundSpread && jsxAstUtils.propName(attribute) === 'key';
      });
    }

    /**
     * Checks if the given node is a function expression or arrow function, and checks if there is a
     * missing key prop in return statement's arguments
     *
     * @param {ASTNode} node
     */
    function checkFunctionsBlockStatement(node: TSESTree.Node) {
      if (isFunctionLikeExpression(node)) {
        if (node.type === 'BlockStatement') {
          getReturnStatements(node, [])
            .filter((returnStatement) => returnStatement && returnStatement.argument)
            .forEach((returnStatement) => {
              checkIteratorElement(returnStatement.argument!);
            });
        }
      }
    }

    /**
     * Checks if the given node is an arrow function that has an JSX Element or JSX Fragment in its
     * body, and the JSX is missing a key prop
     *
     * @param {ASTNode} node
     */
    function checkArrowFunctionWithJSX(node: TSESTree.Node) {
      const isArrFn = node && node.type === 'ArrowFunctionExpression';
      const shouldCheckNode = (n) => n && (n.type === 'JSXElement' || n.type === 'JSXFragment');
      if (isArrFn && shouldCheckNode(node.body)) {
        checkIteratorElement(node);
      }
      if (node.type === 'ConditionalExpression') {
        if (shouldCheckNode(node.consequent)) {
          checkIteratorElement(node.consequent);
        }
        if (shouldCheckNode(node.alternate)) {
          checkIteratorElement(node.alternate);
        }
      } else if (node.type === 'LogicalExpression' && shouldCheckNode(node.right)) {
        checkIteratorElement(node.right);
      }
    }

    const childrenToArraySelector = `:matches(
      CallExpression
        [callee.object.object.name=Fragment]
        [callee.object.property.name=Children]
        [callee.property.name=toArray],
      CallExpression
        [callee.object.name=Children]
        [callee.property.name=toArray]
    )`.replace(/\s/g, '');
    let isWithinChildrenToArray = false;

    const seen = new WeakSet();

    return {
      [childrenToArraySelector]() {
        isWithinChildrenToArray = true;
      },

      [`${childrenToArraySelector}:exit`]() {
        isWithinChildrenToArray = false;
      },

      ArrayExpression(node: TSESTree.ArrayExpression) {
        if (isWithinChildrenToArray) {
          return;
        }

        const jsx = node.elements.filter((x) => x && x.type === 'JSXElement');
        if (jsx.length === 0) {
          return;
        }

        const map = {};
        if (warnOnDuplicates) {
          Object.values(map)
            .filter((v: any) => v.length > 1)
            .forEach((v: any) => {
              v.forEach((n: any) => {
                if (!seen.has(n)) {
                  seen.add(n);
                  context.report({
                    node: n,
                    messageId: 'nonUniqueKeys',
                  });
                }
              });
            });
        }
      },
      'JSXElement > JSXElement'(node: TSESTree.JSXElement) {
        if (isWithinChildrenToArray) {
          return;
        }

        const jsx = node.children.filter((x) => x && x.type === 'JSXElement');
        if (jsx.length === 0) {
          return;
        }

        const map = {};

        jsx.forEach((element) => {
          const attrs = node.openingElement.attributes;
          const keys = attrs.filter((x) => x.type && x.name === 'key');

          if (keys.length === 0) {
            context.report({
              node: element,
              messageId: 'missingArrayKey',
            });
          }
        });

        if (warnOnDuplicates) {
          Object.values(map)
            .filter((v: any) => v.length > 1)
            .forEach((v: any) => {
              v.forEach((n) => {
                if (!seen.has(n)) {
                  seen.add(n);
                  context.report({
                    node: n,
                    messageId: 'nonUniqueKeys',
                  });
                }
              });
            });
        }
      },

      JSXFragment(node) {
        if (!checkFragmentShorthand || isWithinChildrenToArray) {
          return;
        }

        if (node.parent.type === 'ArrayExpression') {
          context.report({
            node,
            messageId: 'missingArrayKeyUsePrag',
          });
        }
      },

      // Array.prototype.map
      // eslint-disable-next-line no-multi-str
      'CallExpression[callee.type="MemberExpression"][callee.property.name="map"],\
       CallExpression[callee.type="OptionalMemberExpression"][callee.property.name="map"],\
       OptionalCallExpression[callee.type="MemberExpression"][callee.property.name="map"],\
       OptionalCallExpression[callee.type="OptionalMemberExpression"][callee.property.name="map"]'(
        node
      ) {
        if (isWithinChildrenToArray) {
          return;
        }

        const fn = node.arguments.length > 0 && node.arguments[0];
        if (!fn || !isFunctionLikeExpression(fn)) {
          return;
        }

        checkArrowFunctionWithJSX(fn);

        checkFunctionsBlockStatement(fn);
      },

      // Array.from
      'CallExpression[callee.type="MemberExpression"][callee.property.name="from"]'(node) {
        if (isWithinChildrenToArray) {
          return;
        }

        const fn = node.arguments.length > 1 && node.arguments[1];
        if (!isFunctionLikeExpression(fn)) {
          return;
        }

        checkArrowFunctionWithJSX(fn);

        checkFunctionsBlockStatement(fn);
      },
    };
  },
};

const missingIterKeyGood = `
import { component$ } from '@builder.io/qwik';

export const Person = component$(() => {
  const person  = {
    firstName: 'John',
    lastName: 'Doe',
    age: 32,
  }

  return (
    <ul>
      {Object.keys(person).map((color) => (
        <li key={\`person-\${key}\`}>{person[key]}</li>
      )}
    </ul>
  );
});`.trim();

const missingIterKeyBad = `
import { component$ } from '@builder.io/qwik';

export const Person = component$(() => {
  const person  = {
    firstName: 'John',
    lastName: 'Doe',
    age: 32,
  }

  return (
    <ul>
      {Object.keys(person).map((color) => (
        <li>{person[key]}</li>
      )}
    </ul>
  );
});`.trim();

const missingIterKeyUsePragGood = `
import { component$ } from '@builder.io/qwik';
import Card from './Card';
import Summary from './Summary';

export const Person = component$(() => {
  const person  = {
    firstName: 'John',
    lastName: 'Doe',
    age: 32,
  }

  return (
    {Object.keys(person).map((color) => (
      <Fragment key={\`person-\${key}\`}>
        <Card value={person[key]} />
        <Summary value={person[key]} />
      </Fragment>
    )}
  );
});`.trim();

const missingIterKeyUsePragBad = `
import { component$ } from '@builder.io/qwik';
import Card from './Card';
import Summary from './Summary';

export const Person = component$(() => {
  const person  = {
    firstName: 'John',
    lastName: 'Doe',
    age: 32,
  }

  return (
    {Object.keys(person).map((color) => (
      < key={\`person-\${key}\`}>
        <Card value={person[key]} />
        <Summary value={person[key]} />
      </>
    )}
  );
});`.trim();

const missingArrayKeyGood = `
import { component$ } from '@builder.io/qwik';

export const ColorList = component$(() => {
  const colors = ['red', 'green', 'blue'];

  return (
    <ul>
      {colors.map((color) => (
        <li key={\`color-\${color}\`}>{color}</li>
      )}
    </ul>
  );
});`.trim();

const missingArrayKeyBad = `
import { component$ } from '@builder.io/qwik';

export const ColorList = component$(() => {
  const colors = ['red', 'green', 'blue'];

  return (
    <ul>
      {colors.map((color) => (
        <li>{color}</li>
      )}
    </ul>
  );
});`.trim();

const missingArrayKeyUsePragGood = `
import { component$, Fragment } from '@builder.io/qwik';

export const ColorList = component$(() => {
  const colors = ['red', 'green', 'blue'];

  return (
    {colors.map((color) => (
      <Fragment key={\`color-\${color}\`}>
        <h2>{color}</h2>
        <p>The color "\${color}" is a great color.</p>
      </Fragment>
    )}
  );
});`.trim();

const missingArrayKeyUsePragBad = `
import { component$ } from '@builder.io/qwik';

export const ColorList = component$(() => {
  const colors = ['red', 'green', 'blue'];

  return (
    {colors.map((color) => (
      < key={\`color-\${color}\`}>
        <h2>{color}</h2>
        <p>The color "\${color}" is a great color.</p>
      </>
    )}
  );
});`.trim();

const nonUniqueKeysGood = missingArrayKeyGood;

const nonUniqueKeysBad = `
import { component$ } from '@builder.io/qwik';

export const ColorList = component$(() => {
  const colors = ['red', 'green', 'blue'];

  return (
    <ul>
      {colors.map((color) => (
        <li key="not-a-good-idea">{color}</li>
      )}
    </ul>
  );
});`.trim();

export const jsxKeyExamples: QwikEslintExamples = {
  missingIterKey: {
    good: [
      {
        codeHighlight: '{13} /key=/#a',
        code: missingIterKeyGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{13}',
        code: missingIterKeyBad,
        description: 'Missing `key` prop for element in iterator.',
      },
    ],
  },
  missingIterKeyUsePrag: {
    good: [
      {
        codeHighlight: '{14} /Fragment/#a',
        code: missingIterKeyUsePragGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{14}',
        code: missingIterKeyUsePragBad,
        description:
          'Missing `key` prop for element in iterator. The key prop allows for improved rendering performance. Shorthand fragment syntax does not support providing keys. Use `<Fragment>` instead',
      },
    ],
  },
  missingArrayKey: {
    good: [
      {
        codeHighlight: '{9} /key=/#a',
        code: missingArrayKeyGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{9}',
        code: missingArrayKeyBad,
        description:
          'Missing `key` prop for element in array. The key prop allows for improved rendering performance.',
      },
    ],
  },
  missingArrayKeyUsePrag: {
    good: [
      {
        codeHighlight: '{8,11} /Fragment/#a',
        code: missingArrayKeyUsePragGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{8,11}',
        code: missingArrayKeyUsePragBad,
        description:
          'Missing `key` prop for element in array. The key prop allows for improved rendering performance. Shorthand fragment syntax does not support providing keys. Use `<Fragment>` instead',
      },
    ],
  },
  nonUniqueKeys: {
    good: [
      {
        codeHighlight: '{9} /key=/#a',
        code: nonUniqueKeysGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{9} /key=/#a /not-a-good-idea/#b',
        code: nonUniqueKeysBad,
        description: 'The `key` prop must be unique.',
      },
    ],
  },
};
