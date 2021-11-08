import * as ac from '@angular/compiler';
import { Interpolation } from '@angular/compiler';


/* Template nodes abstracted from the angular-specific AST */

export type ExpressionAttributeValue = { type: 'expression', expression: string};
export type EventAttributeValue = { type: 'event', expression: string};
export type StringAttributeValue = { type: 'string', expression: string };
export type InterpolationAttributeValue = { type: 'interpolation', interpolation: Interpolation, bindingExpressions: TemplateExpr[] };
export type AttributeValue = ExpressionAttributeValue | StringAttributeValue | InterpolationAttributeValue | EventAttributeValue;

export type ConditionalClass = {className:string, condition: string};
export type Attribute = {name:string, value: AttributeValue};
export type StyleBinding = {property:string, expression: string, unit:string};

export interface IntermediateNode {
    children: IntermediateNode[];
    visit(visitor: IntermediateVisitor): any;
}

export class ElementIntermediate implements IntermediateNode {
    constructor(
        readonly element: ac.TmplAstElement,
        readonly children: IntermediateNode[],
        readonly tagName: string,
        readonly selfClose: boolean,
        readonly isComponent: boolean,
        readonly styleBindings: StyleBinding[],
        readonly conditionalClasses: ConditionalClass[],
        readonly attributes: Attribute[],
        readonly className: string,
        readonly style: string,
         ) { }
    visit(visitor: IntermediateVisitor) { visitor.visitElement(this); }
}

export class Conditional implements IntermediateNode {
    constructor(
        readonly template: ac.TmplAstTemplate,
        readonly children: IntermediateNode[],
        readonly condition: TemplateExpr) { }
    get indent() { return this.template.startSourceSpan.start.col; }
    visit(visitor: IntermediateVisitor) { visitor.visitConditional(this); }
}

export class Switch implements IntermediateNode {
    constructor(
        readonly element: ac.TmplAstTemplate | ac.TmplAstElement,
        readonly children: IntermediateNode[],
        readonly expression: TemplateExpr) { }
    get indent() { return this.element.startSourceSpan.start.col; }
    visit(visitor: IntermediateVisitor) { visitor.visitSwitch(this); }
}

export class SwitchCase implements IntermediateNode {
    constructor(
        readonly template: ac.TmplAstTemplate,
        readonly children: IntermediateNode[],
        readonly condition: TemplateExpr) { }
    get indent() { return this.template.startSourceSpan.start.col; }
    visit(visitor: IntermediateVisitor) { visitor.visitSwitchCase(this); }
}

export class SwitchDefault implements IntermediateNode {
    constructor(
        readonly template: ac.TmplAstTemplate,
        readonly children: IntermediateNode[]) { }
    get indent() { return this.template.startSourceSpan.start.col; }
    visit(visitor: IntermediateVisitor) { visitor.visitSwitchDefault(this); }
}

export class ForOf implements IntermediateNode {
    constructor(
        readonly template: ac.TmplAstTemplate,
        readonly children: IntermediateNode[],
        readonly iterable: TemplateExpr,
        readonly varName: string) { }
    get indent() { return this.template.startSourceSpan.start.col; }
    visit(visitor: IntermediateVisitor) { visitor.visitForOf(this); }
}

export class TextIntermediate implements IntermediateNode {
    children = [];
    constructor(readonly text: string) { }
    visit(visitor: IntermediateVisitor) { visitor.visitText(this); }
    get isWhitespace() { return /^\s*$/.test(this.text); }
}

export class TextWithInterpolations implements IntermediateNode {
    children = [];
    constructor(readonly interpolations: Interpolation, readonly bindingExpressions: TemplateExpr[]) { }
    visit(visitor: IntermediateVisitor) { visitor.visitTextWithInterpolation(this); }
}

export class ContainerIntermediate implements IntermediateNode {
    constructor(readonly children: IntermediateNode[]) { }
    visit(visitor: IntermediateVisitor) { visitor.visitContainer(this); }
}

export interface IntermediateVisitor<Result = any> {
    visitTextWithInterpolation(node: TextWithInterpolations): Result;
    visitText(node: TextIntermediate): Result;
    visitForOf(node: ForOf): Result;
    visitSwitch(node: Switch): Result;
    visitSwitchCase(node: SwitchCase): Result;
    visitSwitchDefault(node: SwitchDefault): Result;
    visitElement(node: ElementIntermediate): Result;
    visitConditional(node: Conditional): Result;
    visitContainer(node: ContainerIntermediate): Result;
}

export class TemplateExpression { 
    constructor(readonly node: ac.AST, readonly source: string) { }
}

export class PipeExpression { 
    constructor(readonly name: string, readonly inner: TemplateExpr, readonly args: any[]) { }
}
export type TemplateExpr = TemplateExpression | PipeExpression;