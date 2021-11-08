import * as ac from '@angular/compiler';
import { Interpolation, isNgContainer, isNgTemplate } from '@angular/compiler';
import { ComponentInfo } from '../componentInfo';
import { generateCode } from './generateTemplate';
import { voidElements } from '../mappings';
import { Attribute, Conditional, ConditionalClass, ContainerIntermediate, ElementIntermediate, ForOf, IntermediateNode, PipeExpression, StyleBinding, Switch, SwitchCase, SwitchDefault, TemplateExpr, TemplateExpression, TextIntermediate, TextWithInterpolations } from './templateIntermediate';

/*
    Transform templates into an intermediate format.

    Uses the Anguar template parser, but builds a more generic intermediate model on top of that.
*/
export function transformTemplateToTsx(template: string, templateUrl: string, componentInfo: ComponentInfo) {
    const intermediateFormat = parseTemplate(template, templateUrl, componentInfo);
    return generateCode(intermediateFormat, componentInfo);
}

export function parseTemplate(template: string, templateUrl: string, componentInfo: ComponentInfo) {
    const parsedTemplate = ac.parseTemplate(template, templateUrl, {preserveWhitespaces: true, preserveLineEndings: true});
    if (parsedTemplate.errors) {
        for (const error of parsedTemplate.errors) {
            console.error(error);
        }
        throw new Error()
    }

    const v = new Visitor(componentInfo);
    const nodes = parsedTemplate.nodes;
    return v.visitTopLevel(nodes);
}

class Visitor {
    constructor(readonly componentInfo: ComponentInfo) { }
    get fileInfo() { return this.componentInfo.fileInfo; }

    visitTopLevel(nodes: ac.TmplAstNode[]) {
        const nodes1 = this.visitNodes(nodes);
        return new ContainerIntermediate(nodes1);
    }

    visitElement(element: ac.TmplAstElement) { 
        let tagName = element.name;
        if (tagName.startsWith(':svg:')) {
            /* for some reason the parser adds :svg: to svg elements. */
            tagName = tagName.replace(':svg:', '');
        }

        /* containers are replaced with their content */
        if (isNgContainer(tagName)) {
            const children = this.visitElementChildren(element);
            return new ContainerIntermediate(children);
        }

        /* Heuristic to find components */
        let isComponent = false;
        const component = this.componentInfo.fileInfo.projectInfo.componentMap.get(tagName);
        if (component) {
            isComponent = true;
            tagName = component.name;
            this.componentInfo.fileInfo.componentsReferenced.set(component.name, component);
        }

        const styleBindings: StyleBinding[] = [];
        const conditionalClasses: ConditionalClass[] = [];
        const attributes: Attribute[] = []; 

        /* process input bindings ala [foo]="bar" */
        for (const input of element.inputs) {
            const name = input.name;
            const ast = (input.value as ac.ASTWithSource);
            const value = ast.source!;
            if (input.type === 2 /* ac.BindingType.Class */) {
                // special case conditional classes
                conditionalClasses.push({className: name, condition: value});
            } else if (input.type === 3 /* ac.BindingType.Style */) {
                styleBindings.push({property: name, expression: value, unit: input.unit!})
            } else if (input.type === 0 /* BindingType.Property */) {
                const excludedAttributes = ['ngSwitch'];
                if (!excludedAttributes.includes(name)) {
                    if (ast.ast instanceof Interpolation) {
                        const interpolation = ast.ast;
                        const exprs = interpolation.expressions.map(ex => this.parseExpression(ast, ex));
                        attributes.push({name: name, value: {type: 'interpolation', interpolation: ast.ast, bindingExpressions: exprs}})
                    } else {
                        attributes.push({name: name, value: {type: 'expression', expression: value}});
                    }
                }
            } else if (input.type === ac.BindingType.Attribute) {
                attributes.push({name: name, value: {type: 'expression', expression: value}});
            } else {
                throw new Error(`BindingType: ${input.type} `);
            }
        }

        /* process output bindings ala (click)="bar($event)" */
        for (const output of element.outputs) {
            const name = output.name;
            const value =  (output.handler as ac.ASTWithSource).source!;
            attributes.push({name: name, value: {type: 'event', expression: value}});
        }

        let style = '';
        let className = '';
        for (const attr of element.attributes) {
            const name = attr.name;
            if (name === 'class') {
                // skip rendering class attribute here, but remember value
                className = attr.value;
            } else if (name === 'style') {
                // skip rendering style attribute here, but remember value
                style = attr.value;
            } else {
                attributes.push({name: name, value: {type: 'string', expression: attr.value}})
            }
        }

        const isClosed = element.endSourceSpan !== null;
        const isSelfClosed = isClosed && element.endSourceSpan!.start === element.startSourceSpan.start;
        let shouldSelfClose = false;
        if (!isClosed) {
            // tsx requires void elements to be self-closed
            if (voidElements.has(tagName)) {
                shouldSelfClose = true;
            }
        }

        const selfClose = isComponent || isSelfClosed || shouldSelfClose;
        const children = this.visitElementChildren(element);
        const elem = new ElementIntermediate(
            element,
            children,
            tagName, 
            selfClose,
            isComponent,
            styleBindings,
            conditionalClasses,
            attributes,
            className,
            style
            );
        return elem;
    }

    visitElementChildren(element: ac.TmplAstTemplate | ac.TmplAstElement) {
        // special case if [ngSwitch] - wrap in switch
        if (element instanceof ac.TmplAstElement) {
            const ifAttribute = element.inputs.find(i => i.name === 'ngIf');
            if (ifAttribute) {
                // throw new Error()
            }
            const switchAttribute = element.inputs.find(i => i.name === 'ngSwitch');
            if (switchAttribute) {
                const expressionAst = switchAttribute.value as ac.ASTWithSource;
                const expression = this.parseExpression(expressionAst, expressionAst.ast);
                const children = this.visitChildren(element);
                for (const node of children) {
                    if (!(node instanceof SwitchCase ||
                        node instanceof SwitchDefault || 
                        (node instanceof TextIntermediate && node.isWhitespace))) {
                            console.error(node);
                            throw new Error('Invalid child element of [ngSwitch]. Must be a SwitchCase or SwitchDefault.')
                    }
                }
                const switchNode = new Switch(element, children, expression);
                return [switchNode];
            } 
        } 
        return this.visitChildren(element);
    }

    visitChildren(element: ac.TmplAstTemplate | ac.TmplAstElement): IntermediateNode[] {
        return this.visitNodes(element.children);
    }

    visitNodes(nodes: ac.TmplAstNode[]): IntermediateNode[] {
        return nodes.map(ch => ch.visit(this));
    }

    /* 
        A Template node represent a container with a structural directive, e.g ngIf

        It can be a ng-container element with a [ngIf] attribute, or it can be
        implicitly generated from a *ngIf-directive.

        The directive as represented as a TemplateAttr for implicit templates, but on 
        explicit ng-templates it is a BoundAttr.

        <div *ngIf...> will genere a Template node containng an Element node.
        The template node will have the tagname from the element, i.e. div.

        An ng-container without a stuctural directive will generate a regular Element node.
        For example <ng-container *ngIf...> will generate a Template-node with a child Element
        with the tagname ng-container.

        An ng-template without any directives will generate a Template node.

    */
    visitTemplate(template: ac.TmplAstTemplate): IntermediateNode {
        let boundAttrs;
        if (isNgTemplate(template.tagName)) {
            boundAttrs = template.inputs;
        } else {
            boundAttrs = template.templateAttrs.filter(t => t instanceof ac.TmplAstBoundAttribute);
        }
       
        const switchDefault = template.templateAttrs.find(t => t.name === 'ngSwitchDefault');
        if (switchDefault) {
            const children = this.visitChildren(template);
            return new SwitchDefault(template, children);
        }
        
        /* template with no args - replace with content */
        if (template.templateAttrs.length === 0 && 
            template.inputs.length === 0) {
            if (isNgTemplate(template.tagName)) {
                // Don't render ng-template elements without any directives
                return new TextIntermediate('');
            } else {
                // render children
                return this.safeVisitChildren(template);
            }
        }
        
        if (boundAttrs.length === 0) {
            return this.safeVisitChildren(template);
        }
        const boundAttr = boundAttrs[0] as ac.TmplAstBoundAttribute;

        const expressionAst = boundAttr.value as ac.ASTWithSource;  
        const value = this.parseExpression(expressionAst, expressionAst.ast);
        if (boundAttr.name === 'ngIf') {
            const children = this.visitChildren(template);
            return new Conditional(template, children, value);
        } else if (boundAttr.name === 'ngSwitchCase') {
            const children = this.visitChildren(template);
            return new SwitchCase(template, children, value);
        } else if (boundAttr.name === 'ngForOf') {
            if (template.variables.length > 0) {
                const varName = template.variables[0].name;
                /*
                    Weird behavior with ForOf
                    Source positions in the expression refer to the 'for foo of expr...' text
                    but the source returned from the ast node is just 'expr...'
                */
                const src = `for ${varName} of ` +  expressionAst.source;
                const value = this.parseExpression1(src, expressionAst.ast);
                const children = this.visitChildren(template);
                return new ForOf(template, children, value, varName);
            }
        } else {
            console.error(boundAttr.name);
            throw new Error();
        }
        throw new Error();
    }
    visitContent(content: ac.TmplAstContent): IntermediateNode {
        console.error('CONTENT', content.sourceSpan.toString());
        throw new Error();
    }
    visitVariable(variable: ac.TmplAstVariable): IntermediateNode {
        console.error('REFERENCE', variable.sourceSpan.toString());
        throw new Error();
    }
    visitReference(reference: ac.TmplAstReference): IntermediateNode {
        console.error('REFERENCE', reference.sourceSpan.toString());
        throw new Error();
    }
    visitTextAttribute(attribute: ac.TmplAstTextAttribute): IntermediateNode {
        console.error('TEXT ATTR', attribute.name, attribute.value);
        throw new Error();
    }
    visitBoundAttribute(attribute: ac.TmplAstBoundAttribute): IntermediateNode {
        console.error('BOUND ATTR', attribute.name, attribute.value);
        throw new Error();
    }
    visitBoundEvent(attribute: ac.TmplAstBoundEvent): IntermediateNode {
        console.error('BOUND EVENT', attribute.sourceSpan.toString());
        throw new Error();
    }
    visitText(text: ac.TmplAstText) {
        return new TextIntermediate(text.value);
    }
    /* text with {{ }} expressions embedded. May be multiple embedded expressions. */
    visitBoundText(text: ac.TmplAstBoundText) {
        const value = text.value as ac.ASTWithSource;
        const interpolation = value.ast as Interpolation;
        const exprs = interpolation.expressions.map(ex => this.parseExpression(value, ex));
        return new TextWithInterpolations(interpolation, exprs);
    }

    parseExpression(source: ac.ASTWithSource, expr: ac.AST): TemplateExpr {
        const exprSource = source.source!;
        return this.parseExpression1(exprSource, expr)
    }
    parseExpression1(source: string, expr: ac.AST): TemplateExpr {
        if (expr instanceof ac.BindingPipe) {
            const pipeName = expr.name;
            const innerExpr = expr.exp;
            const inner = this.parseExpression1(source, innerExpr);
            return new PipeExpression(pipeName, inner, expr.args);
        } else {
            const innerSource = source.substring(expr.span.start, expr.span.end);
            return new TemplateExpression(expr, innerSource);
        }
    }

    visitIcu(icu: ac.TmplAstIcu): IntermediateNode {
        console.error('ICU', icu.sourceSpan.toString());
        throw new Error();
    }

    /* visit node children, and surround with <></> is there is more than one (non-whitespace) child  */
    safeVisitChildren(element: ac.TmplAstElement | ac.TmplAstTemplate) {
        const children = this.visitChildren(element);
        return new ContainerIntermediate(children);
    }
}


