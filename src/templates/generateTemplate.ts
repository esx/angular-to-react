import { kebabCaseToCamelCase } from '../case';
import { ComponentInfo } from '../componentInfo';
import { attributeDomAliases, caseMap, eventNameMap, nonStringAttributes } from '../mappings';
import { defaultPipeHandler, pipeHandlers } from '../config/pipes';
import { Attribute, AttributeValue, Conditional, ConditionalClass, ContainerIntermediate, ElementIntermediate, ExpressionAttributeValue, ForOf, IntermediateNode, IntermediateVisitor, PipeExpression, StyleBinding, Switch, SwitchCase, SwitchDefault, TemplateExpr, TemplateExpression, TextIntermediate, TextWithInterpolations } from './templateIntermediate';
import { TextBuffer } from '../text';

/*
    Generate tsx output based on the mintermediate
*/

export function generateCode(intermediateFormat: ContainerIntermediate, componentInfo: ComponentInfo) {
    const t = new TextBuffer();
    const g = new TsxGenerator(t, componentInfo);
    intermediateFormat.visit(g);
    return t.text;
}

function nonWhitespaceNodes(nodes: IntermediateNode[]) {
    function isWhitespaceNode(node: IntermediateNode) {
        return node instanceof TextIntermediate && node.isWhitespace;
    }
    return nodes.filter(n => !isWhitespaceNode(n));
}

function htmlAttributeNameToDomName(name: string) {
    if (name.startsWith('data-') || name.startsWith('aria-')) {
        // data- and aria- attributes are supported directly by React
        return name;
    }
    let domName = kebabCaseToCamelCase(name);
    domName = attributeDomAliases.get(domName) ?? domName;
    domName = caseMap.get(domName) ?? domName;
    return domName;
}

class TsxGenerator implements IntermediateVisitor {
    constructor(readonly t: TextBuffer, readonly componentInfo: ComponentInfo) { }

    add(str: string) { this.t.emit(str); }

    visitElement(element: ElementIntermediate) {
        this.add('<');
        this.add(element.tagName);

        for (const attr of element.attributes) {
            this.generateAttribute(attr)
        }

        this.renderClassName(element.className, element.conditionalClasses);
        this.renderStyleAttribute(element.style, element.styleBindings);

        /* close start-tag */
        if (element.selfClose) {
            this.add(' /');
        }
        this.add('>');

        this.visitChildren(element);

        if (!element.selfClose) {
            this.add(`</${element.tagName}>`);
        }
    }

    generateAttribute(attr: Attribute) {
        this.add(' ');
        if (attr.value.type === 'event') {
            this.add(this.generateEventAttribute(attr));
            return;
        }
        // transfrom html names to DOM names
        const propertyName = htmlAttributeNameToDomName(attr.name);
        const valueExpression = this.generateAttributeValue(propertyName, attr.value);
        const value = valueExpression.value;
        if (propertyName.toLowerCase() === 'innerhtml') {
            this.add(`dangerouslySetInnerHTML={{__html: ${value} }}`);
        } else {
            this.add(`${propertyName}=`);
            if (valueExpression.type === 'string') {
                this.add(value);
            } else {
                this.add(`{${value}}`);
            }
        }
    }

    generateAttributeValue(propertyName: string, value: AttributeValue) {
        if (value.type === 'string') {
            if (nonStringAttributes.has(propertyName)) {
                return  {type:'expression', value: value.expression};
            } else {
                const escaped = value.expression.replace('\'', '&apos;')
                return  {type:'string', value: `'${escaped}'`};  
            }
        } else if (value.type === 'expression') {
            return {type:'expression', value: value.expression };
        } else if (value.type === 'interpolation') {
            const interpolations = value.interpolation;
            const strings = interpolations.strings;
            let buf = '';
            for (let ix = 0; ix < interpolations.expressions.length; ix++) {
                buf += strings[ix];
                const expr = value.bindingExpressions[ix];
                const interp = this.generateTemplateExpression(expr);
                buf += '${' + interp + '}';
            }
            buf += strings[strings.length - 1];
            const expression = '`' + buf + '`';
            return {type:'expression', value: expression};
        } else {
            throw new Error();
        }
    }

    transformPipeExpression(pipeExpression: PipeExpression, innerSource: string): string {
        const pipeName = pipeExpression.name;
        let handler = pipeHandlers[pipeName];
        if (!handler) {
            console.warn(`No configuration for pipe '${pipeName}'. Using default transformation.`)
            handler = defaultPipeHandler;
        }
        if (handler.imports) {
            this.componentInfo.fileInfo.addImports(handler.imports)
        }
        if (handler.transform) {
            return handler.transform(innerSource, pipeName);
        } else {
            return defaultPipeHandler.transform(innerSource, pipeName);
        }
    }

    /* Resolve pipe expressions, and transform into source code */
    generateTemplateExpression(expr: TemplateExpr): string {
        if (expr instanceof PipeExpression) {
            const innerSource = this.generateTemplateExpression(expr.inner);
            return this.transformPipeExpression(expr, innerSource);
        } else if (expr instanceof TemplateExpression) {
            return expr.source;
        } else {
            console.error(expr)
            throw new Error();
        }
    }

    generateEventAttribute(output: Attribute) {
        const eventName = eventNameMap.get(output.name) ?? output.name;
        const handler = (output.value as ExpressionAttributeValue).expression;
        if (/\$event\b/.test(handler)) {
            // could use .nativeEvent, but this would not works with custom events
            //handler = handler.replace(/\$event/g, '$event.nativeEvent\b');
            return `${eventName}={($event)=>${handler}}`;  
        } 
        return `${eventName}={()=>${handler}}`;
    }

    /* true if children consist of a single element (not code unit) */
    isRootedElement(nodes: IntermediateNode[]) {
        const elems = nonWhitespaceNodes(nodes);
        if (elems.length !== 1) {
            return false;
        }
        const top = elems[0];
        return (top instanceof ElementIntermediate || top instanceof ContainerIntermediate);
    }

    visitConditional(conditional: Conditional) {
        const indent = conditional.indent;
        const expr = this.generateTemplateExpression(conditional.condition);
        this.t.emit(`{ ${expr} && (`);
        this.t.emitIndentedLine(indent + 4, '');
        this.safeVisitChildren(conditional);
        this.t.emit(`)} `);
    }

    visitForOf(forOf: ForOf) {
        const expr = this.generateTemplateExpression(forOf.iterable);
        this.t.emit(`{(${expr}).map(${forOf.varName} => (`);
        this.t.emitIndentedLine(forOf.indent + 4, '');
        this.safeVisitChildren(forOf);
        this.t.emit(`))} `);
    }

    /* 
        Wrap a switch in a self-invoking function.
        This is pretty ugly, but required since only expressonscan be embedded in tsx.
        The user will probably want to extract it to a seperate function.
    */
    visitSwitch(switchNode: Switch) {
        const expr = this.generateTemplateExpression(switchNode.expression);
        this.t.emit(`{(()=>{ switch (${expr}) {`);
        // we dont use safeVisitChildred, since we are in a code context now
        this.visitChildren(switchNode);
        this.t.emitIndentedLine(switchNode.indent, `}})()} `);
    }

    visitSwitchCase(switchCase: SwitchCase) {
        const expr = this.generateTemplateExpression(switchCase.condition);
        this.t.emit(`case ${expr}: return (`);
        this.t.emitIndentedLine(switchCase.indent + 4, '');
        this.safeVisitChildren(switchCase);
        this.t.emit(`); `);
    }

    visitSwitchDefault(switchDefault: SwitchDefault) {
        this.t.emit(`default: return (`);
        this.t.emitIndentedLine(switchDefault.indent + 4, '');
        this.safeVisitChildren(switchDefault);
        this.t.emit(`); `);
    }

    visitText(node: TextIntermediate) {
        this.t.emit(node.text);
    }

    visitTextWithInterpolation(node: TextWithInterpolations) {
        const interpolations = node.interpolations;
        const strings = interpolations.strings;
        for (let ix = 0; ix < node.interpolations.expressions.length; ix++) {
            this.t.emit(strings[ix]);
            const expr = node.bindingExpressions[ix];
            const interp = this.generateTemplateExpression(expr);
            this.t.emit(`{${interp}}`);
        }
        this.t.emit(strings[strings.length - 1]);
    }

    /* visit node children, and surround with <></> is there is more than one (non-whitespace) child  */
    safeVisitChildren(node: IntermediateNode) {
        const rooted = this.isRootedElement(node.children);
        if (!rooted) { this.t.emit('<>'); }
        this.visitChildren(node);
        if (!rooted) { this.t.emit('</>'); }
    }

    visitChildren(element: IntermediateNode): void {
        element.children.forEach(ch => ch.visit(this));
    }

    visitContainer(node: ContainerIntermediate) {
        this.safeVisitChildren(node);
    }

    renderClassName(className: string, conditionalClasses: ConditionalClass[]) {
        if (conditionalClasses.length > 0) {
            // render class name attribute with conditionals
            let expression = `'${className}'`;
            for (const {className, condition} of conditionalClasses) {
                // assume 
                expression += ` + (${condition} ? ' ${className}' : '')`;
            }
            this.add(` className={${expression}}`);
        } else if (className !== '') {
            // add regular class attribute
            this.add(` className='${className}'`);
        }
    }

    renderStyleAttribute(style: string, styleBindings: StyleBinding[]) {
        type Declaration = {name:string, value: string};
        function cssToJsCase(name: string) {
            return name.replace(/-(\w)/g, (_all, capture1)=>capture1.toUpperCase());
        }
        function parseStyleAttribute(css: string) {
            return css
            .replace(/\/\*.*?\*\//g, ' ') 
            .split(';')
            .map(d => d.trim())
            .filter(d => d !== '')
            .map(d => d.split(':').map(part => part.trim()))
            .map(parts => ({name: parts[0], value: "'" + parts[1] + "'"})) as Declaration[];
        }
        const declarations: Declaration[] = parseStyleAttribute(style);
        for (const binding of styleBindings) {
            declarations.push({name: binding.property, value: binding.expression})
        }
        if (declarations.length === 0) {
            return;
        }
        const syntax = declarations.map(d => `${cssToJsCase(d.name)}: ${d.value}`).join(', ');
        this.add(` style={{${syntax}}}`);
    }
}