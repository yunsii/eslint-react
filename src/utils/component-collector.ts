import { AST_NODE_TYPES as N, type TSESTree } from "@typescript-eslint/types";

import type { RuleContext } from "../../typings";
import { MutList, O } from "../lib";
import type * as AST from "./ast-types";
import { isValidReactComponentName } from "./is-valid-name";
import { isJSXValue, isNodeReturningJSX } from "./jsx";
import { getFunctionIdentifier } from "./misc";

const seenComponents = new WeakSet<AST.TSESTreeFunction>();

export function make(context: RuleContext) {
    const components: AST.TSESTreeFunction[] = [];
    const functionStack = MutList.make<AST.TSESTreeFunction>();
    const getCurrentFunction = () => O.fromNullable(MutList.tail(functionStack));
    const onFunctionEnter = (node: AST.TSESTreeFunction) => MutList.append(functionStack, node);
    const onFunctionExit = () => MutList.pop(functionStack);

    const ctx = {
        getAllComponents() {
            if (context.getScope().block.type !== N.Program) {
                throw new Error("getAllComponents should only be called in Program:exit");
            }

            return components;
        },
        getCurrentComponents() {
            return [...components];
        },
        getCurrentFunction,
        getCurrentFunctionStack() {
            return [...functionStack];
        },
    } as const;

    const listeners = {
        ArrowFunctionExpression: onFunctionEnter,
        "ArrowFunctionExpression:exit": onFunctionExit,
        FunctionDeclaration: onFunctionEnter,
        "FunctionDeclaration:exit": onFunctionExit,
        FunctionExpression: onFunctionEnter,
        "FunctionExpression:exit": onFunctionExit,
        ReturnStatement(node: TSESTree.ReturnStatement) {
            const maybeCurrentFn = getCurrentFunction();

            if (O.isNone(maybeCurrentFn)) {
                console.warn("Unexpected empty function stack");

                return;
            }

            const currentFn = maybeCurrentFn.value;

            if (seenComponents.has(currentFn)) {
                components.push(currentFn);

                return;
            }

            const functionId = getFunctionIdentifier(currentFn);
            if (functionId && !isValidReactComponentName(functionId.name)) {
                return;
            }

            if (!isNodeReturningJSX(node, context)) {
                return;
            }

            seenComponents.add(currentFn);
            components.push(currentFn);
        },
        // eslint-disable-next-line perfectionist/sort-objects
        "ArrowFunctionExpression[body.type!='BlockStatement']"(node: TSESTree.ArrowFunctionExpression) {
            const maybeCurrentFn = getCurrentFunction();

            if (O.isNone(maybeCurrentFn)) {
                console.warn("Unexpected empty function stack");

                return;
            }

            const currentFn = maybeCurrentFn.value;

            if (seenComponents.has(currentFn)) {
                components.push(currentFn);

                return;
            }

            const { body } = node;
            if (!isJSXValue(body, context, false, false)) {
                return;
            }

            const functionId = getFunctionIdentifier(currentFn);
            if (functionId && !isValidReactComponentName(functionId.name)) {
                return;
            }

            seenComponents.add(currentFn);
            components.push(currentFn);
        },
    } as const;

    return {
        ctx,
        listeners,
    };
}
