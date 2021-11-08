import * as ts from 'typescript';
import { TextBuffer } from './text';

export function isComponent(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.decorators) {
        const decorator1 = getDecorator(node, 'Component');
        if (decorator1) {
            const objLit = decorator1.arguments[0] as ts.ObjectLiteralExpression;
            const name = (node.name) ? node.name.text : undefined;
            return {node: node, name: name, arg: objLit };
        }
    }
}

export function isReadonly(decl: ts.PropertyDeclaration) {
    const modifiers = decl.modifiers;
    return modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword);
}

export function isInput(node: ts.Node) {
    return hasDecorator(node, 'Input');
}

export function isOutput(node: ts.Node) {
    return hasDecorator(node, 'Output');
}

function hasDecorator(node: ts.Node, decoratorName: string) {
    return getDecorator(node, decoratorName) !== undefined;
}

function getDecorator(node: ts.Node, decoratorName: string) {
    if (!node.decorators) {
        return undefined;
    }
    const decorator = node.decorators.find(d => 
        ts.isCallExpression(d.expression) && 
        ts.isIdentifier(d.expression.expression) && 
        d.expression.expression.text === decoratorName);
    if (!decorator) {
        return undefined;
    }
    return decorator.expression as ts.CallExpression;
}

export const isAssignment = (node: ts.Node): node is ts.BinaryExpression =>
    ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;

export const isThisMember = (node: ts.Node): node is ts.PropertyAccessExpression =>
    ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword;

export const hasNonEmptyBody = (body: ts.Block | undefined): body is ts.Block => 
    body !== undefined && body.statements.length > 0;

    
export class SourceTreeHelper {
    constructor(readonly sourceFile: ts.SourceFile) { }

    getLeadingTrivia(node: ts.Node) {
        return this.sourceFile.text.substring(node.getFullStart(), node.getStart(this.sourceFile));
    }

    getSource(node: ts.Node) { return node.getText(this.sourceFile); }
    getArraySource<T extends ts.Node>(nodeArray: ts.NodeArray<T> | undefined) {
        if (!nodeArray) {
            return '';
        }
        const text = new TextBuffer();
        for (const node of nodeArray) {
            text.emit(node.getText(this.sourceFile));
            text.emit(' ');
        }
        return text.text.trim();
    }
  
    /*
      Used for debugging
    */
    printRecursive(node: ts.Node) {
        const sourceFile = this.sourceFile;
        function printRecursiveFrom(node: ts.Node, indentLevel: number) {
            const indentation = '-'.repeat(indentLevel);
            const syntaxKind = ts.SyntaxKind[node.kind];
            const nodeText = node.getText(sourceFile);
            console.log(`${indentation}${syntaxKind}: ${nodeText}`);
        
            node.forEachChild(child =>
                printRecursiveFrom(child, indentLevel + 1)
            );
        }
        printRecursiveFrom(node, 0);
    }
}

export class TypedSourceTreeHelper extends SourceTreeHelper {
    constructor(readonly sourceFile: ts.SourceFile, readonly typeChecker: ts.TypeChecker) {
        super(sourceFile);
     }

    inferType(node: ts.Node) {
        const ttype = this.typeChecker.getTypeAtLocation(node);
        return this.typeChecker.typeToString(ttype);
    }
}
  