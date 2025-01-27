import { isOneOf } from "@eslint-react/ast";
import { F, O } from "@eslint-react/tools";
import type { TSESTree } from "@typescript-eslint/types";
import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { ReportDescriptor } from "@typescript-eslint/utils/ts-eslint";
import type { CamelCase } from "string-ts";

import { createRule } from "../utils";

export const RULE_NAME = "no-comment-textnodes";

export type MessageID = CamelCase<typeof RULE_NAME>;

export default createRule<[], MessageID>({
  meta: {
    type: "problem",
    docs: {
      description: "disallow comments from being inserted as text nodes",
    },
    messages: {
      noCommentTextnodes:
        "Possible misused comment in text node. Comments inside children section of tag should be placed inside braces.",
    },
    schema: [],
  },
  name: RULE_NAME,
  create(context) {
    function hasCommentLike(node: TSESTree.JSXText | TSESTree.Literal) {
      if (isOneOf([AST_NODE_TYPES.JSXAttribute, AST_NODE_TYPES.JSXExpressionContainer])(node.parent)) return false;
      const rawValue = context.sourceCode.getText(node);
      return /^\s*\/(?:\/|\*)/mu.test(rawValue);
    }
    const getReportDescriptor = (node: TSESTree.JSXText | TSESTree.Literal): O.Option<ReportDescriptor<MessageID>> => {
      if (!isOneOf([AST_NODE_TYPES.JSXElement, AST_NODE_TYPES.JSXFragment])(node.parent)) return O.none();
      if (!hasCommentLike(node)) return O.none();
      if (!node.parent.type.includes("JSX")) return O.none();
      return O.some({
        messageId: "noCommentTextnodes",
        node,
      });
    };
    const ruleFunction = F.flow(getReportDescriptor, O.map(context.report), F.constVoid);
    return {
      JSXText: ruleFunction,
      Literal: ruleFunction,
    };
  },
  defaultOptions: [],
});
