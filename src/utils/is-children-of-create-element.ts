import type { TSESTree } from "@typescript-eslint/types";

import type { RuleContext } from "../../typings";
import { isCreateElement } from "./is-create-element";

export function isChildrenOfCreateElement(node: TSESTree.Node, context: RuleContext) {
    const maybeCallExpression = node.parent;

    if (!maybeCallExpression || !isCreateElement(maybeCallExpression, context)) {
        return false;
    }

    return maybeCallExpression.arguments
        .slice(2)
        .some((child) => child === node);
}
