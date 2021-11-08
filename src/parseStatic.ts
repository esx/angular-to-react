import * as ts from 'typescript';

/* Parse a static expression like the object literal argument to a @Component decorator.
    Since we only really use the "selector" property, this is quite limited.
*/
export function parseStatic(node: ts.Expression, sourceFile: ts.SourceFile) {
    if (ts.isObjectLiteralExpression(node)) {
        const obj: any = {};
        node.forEachChild(ch => {
            if (ts.isPropertyAssignment(ch)) {
                if (ts.isIdentifier(ch.name)) {
                    obj[ch.name.text] = parseStatic(ch.initializer, sourceFile);
                }
            }
        });
        return obj;
    }
    if (ts.isArrayLiteralExpression(node)) {
        const arr: unknown[] = [];
        node.forEachChild(ch => {
            if (ts.isStringLiteral(ch)) {
                arr.push(parseStatic(ch, sourceFile));
            }
        });
        return arr;
    }
    if (ts.isStringLiteral(node)) {
        return node.text;
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.rawText;
    }
    // any other value just null
    return null;
}