import { getNestedReturnStatements, is, isMapCallLoose, isOneOf } from "@eslint-react/ast";
import { isChildrenToArrayCall } from "@eslint-react/core";
import { findPropInAttributes } from "@eslint-react/jsx";
import { F, MutRef, O } from "@eslint-react/tools";
import { isNodeValueEqual } from "@eslint-react/var";
import type { TSESTree } from "@typescript-eslint/types";
import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { ReportDescriptor } from "@typescript-eslint/utils/ts-eslint";
import type { CamelCase } from "string-ts";
import { isMatching, match } from "ts-pattern";

import { createRule } from "../utils";

export const RULE_NAME = "no-duplicate-key";

export type MessageID = CamelCase<typeof RULE_NAME>;

export default createRule<[], MessageID>({
  meta: {
    type: "problem",
    docs: {
      description: "disallow duplicate keys when rendering list",
    },
    messages: {
      noDuplicateKey: "A key must be unique. '{{value}}' is duplicated.",
    },
    schema: [],
  },
  name: RULE_NAME,
  create(context) {
    const isWithinChildrenToArrayRef = MutRef.make(false);
    function isKeyEqual(a: TSESTree.Node, b: TSESTree.Node) {
      return isNodeValueEqual(a, b, [context.sourceCode.getScope(a), context.sourceCode.getScope(b)]);
    }
    function checkIteratorElement(node: TSESTree.Node): O.Option<ReportDescriptor<MessageID>> {
      if (node.type !== AST_NODE_TYPES.JSXElement) return O.none();
      const initialScope = context.sourceCode.getScope(node);
      return F.pipe(
        findPropInAttributes(node.openingElement.attributes, initialScope)("key"),
        O.flatMap((k) => "value" in k ? O.fromNullable(k.value) : O.none()),
        O.flatMap((v) => {
          return isKeyEqual(v, v)
            ? O.some({
              messageId: "noDuplicateKey",
              node: v,
              data: {
                value: context.sourceCode.getText(v),
              },
            })
            : O.none();
        }),
      );
    }

    function checkExpression(node: TSESTree.Expression): O.Option<ReportDescriptor<MessageID>> {
      switch (node.type) {
        case AST_NODE_TYPES.JSXElement:
        case AST_NODE_TYPES.JSXFragment:
          return checkIteratorElement(node);
        case AST_NODE_TYPES.ConditionalExpression:
          if (!("consequent" in node)) return O.none();
          return F.pipe(
            checkIteratorElement(node.consequent),
            O.orElse(() => checkIteratorElement(node.alternate)),
          );
        case AST_NODE_TYPES.LogicalExpression:
          if (!("left" in node)) return O.none();
          return F.pipe(
            checkIteratorElement(node.left),
            O.orElse(() => checkIteratorElement(node.right)),
          );
        default:
          return O.none();
      }
    }

    function checkBlockStatement(node: TSESTree.BlockStatement) {
      return getNestedReturnStatements(node)
        .reduce<ReportDescriptor<MessageID>[]>((acc, statement) => {
          if (!statement.argument) return acc;
          const maybeDescriptor = checkIteratorElement(statement.argument);
          if (O.isNone(maybeDescriptor)) return acc;
          const descriptor = maybeDescriptor.value;

          return [...acc, descriptor];
        }, []);
    }

    const seen = new WeakSet<TSESTree.JSXElement>();

    return {
      "ArrayExpression, JSXElement > JSXElement"(node: TSESTree.ArrayExpression | TSESTree.JSXElement) {
        if (MutRef.get(isWithinChildrenToArrayRef)) return;
        const elements = match(node)
          .with({ type: AST_NODE_TYPES.ArrayExpression }, ({ elements }) => elements)
          .with({ type: AST_NODE_TYPES.JSXElement }, ({ parent }) => "children" in parent ? parent.children : [])
          .otherwise(() => [])
          .filter(is(AST_NODE_TYPES.JSXElement))
          .filter((element) => !seen.has(element));
        const keys = elements.reduce<[
          TSESTree.JSXElement,
          TSESTree.JSXAttribute,
          TSESTree.JSXElement | TSESTree.JSXExpression | TSESTree.Literal,
        ][]>(
          (acc, element) => {
            const attr = element.openingElement.attributes
              .findLast(attr => {
                if (attr.type !== AST_NODE_TYPES.JSXAttribute) return false;
                return attr.name.name === "key";
              });
            if (!attr || !("value" in attr) || attr.value === null) return acc;
            const { value } = attr;
            if (acc.length === 0) return [[element, attr, value]];
            if (acc.some(([_, _1, v]) => isKeyEqual(v, value))) {
              return [...acc, [element, attr, value]];
            }
            return acc;
          },
          [],
        );
        if (keys.length < 2) return;
        for (const [element, attr, value] of keys) {
          seen.add(element);
          context.report({
            messageId: "noDuplicateKey",
            node: attr,
            data: {
              value: context.sourceCode.getText(value),
            },
          });
        }
      },
      CallExpression(node) {
        if (isChildrenToArrayCall(node, context)) MutRef.set(isWithinChildrenToArrayRef, true);
        const isMapCall = isMapCallLoose(node);
        const isArrayFromCall = isMatching({
          type: AST_NODE_TYPES.CallExpression,
          callee: {
            type: AST_NODE_TYPES.MemberExpression,
            property: {
              name: "from",
            },
          },
        }, node);
        if (!isMapCall && !isArrayFromCall) return;
        if (MutRef.get(isWithinChildrenToArrayRef)) return;
        const fn = node.arguments[isMapCall ? 0 : 1];
        if (!isOneOf([AST_NODE_TYPES.ArrowFunctionExpression, AST_NODE_TYPES.FunctionExpression])(fn)) return;
        if (fn.body.type === AST_NODE_TYPES.BlockStatement) {
          for (const descriptor of checkBlockStatement(fn.body)) {
            context.report(descriptor);
          }
          return;
        }
        O.map(checkExpression(fn.body), context.report);
      },
      "CallExpression:exit"(node) {
        if (isChildrenToArrayCall(node, context)) MutRef.set(isWithinChildrenToArrayRef, false);
      },
    };
  },
  defaultOptions: [],
});
