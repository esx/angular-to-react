import * as ts from 'typescript';
import { Component } from './angularInterfaces';
import { parseStatic } from './parseStatic';
import * as path from 'path';
import * as fs from 'fs';
import { transformTemplateToTsx } from './templates/parseTemplate';
import { TextBuffer } from './text';
import { ComponentInfo, ComponentMembers, ComponentRecord, FileInfo, MemberDeclaration, ProjectInfo } from './componentInfo';
import { defaultInjectionHandler, injectionHandlers } from './config/injections';
import { isComponent, isInput, isOutput, isReadonly, isAssignment, isThisMember, TypedSourceTreeHelper, hasNonEmptyBody } from './astUtilities';

/*    
    Scan a source file to find all components (classes decorated with @Component())
*/
export function findComponents(sourceFile: ts.SourceFile) {
    const components: ComponentRecord[] = [];

    function scan(node: ts.Node) {
        const comp = isComponent(node);
        if (comp) {
            const {name, arg} = comp;
            const decoratorArgument = parseStatic(arg, sourceFile) as Component;
            const selector = decoratorArgument.selector!;
            components.push(new ComponentRecord(selector, name!, sourceFile.fileName));
            return;
        }
        for (const child of node.getChildren(sourceFile)) {
            scan(child)
        }
    }

    scan(sourceFile);
    return components;
}

export function transformComponentFile(f: ts.SourceFile, projectInfo: ProjectInfo) {
    const t = new FileTransformer(f, projectInfo);
    t.transform(f);
    addImports(t.fileInfo, t.out)
    return {text: t.out.text};
}

class FileTransformer extends TypedSourceTreeHelper {
    readonly out = new TextBuffer();
    fileInfo;
    constructor(sourceFile: ts.SourceFile, readonly projectInfo: ProjectInfo) {
        super(sourceFile, projectInfo.typeChecker);
        this.fileInfo = new FileInfo(sourceFile.fileName, projectInfo);
    }

    /* transform a node which is NOT inside a component */
    transform(node: ts.Node) {
        const comp = isComponent(node);
        if (comp) {
            this.transformComponentClass(comp.node, comp.arg);
            return;
        }

        // Remove all @angular-related imports
        if (ts.isImportDeclaration(node)) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                const module = node.moduleSpecifier.text;
                if (module.startsWith('@angular')) {
                    return;
                }
            }
        }
    
        if (node.getChildCount(this.sourceFile) === 0) {
            const nodeText = node.getFullText(this.sourceFile);
            this.out.emit(nodeText);
        }
        for (const child of node.getChildren(this.sourceFile)) {
            this.transform(child)
        }
    }

    /* First pass: scan component members and identify props and state */
    scanComponentMembers(cls: ts.ClassDeclaration) {
        // first pass: collect props and state members
        const props: MemberDeclaration[] = [];
        const state: MemberDeclaration[] = [];
        const constants: MemberDeclaration[] = [];
        for (const member of cls.members) {
            if (ts.isPropertyDeclaration(member)) {
                const name = this.getSource(member.name);
                const typeStr = member.type ? this.getSource(member.type) : this.inferType(member);
                const initializer = member.initializer;
                
                if (isInput(member)) {
                    /* properties with Input() decorator are added to 'props' */
                    props.push({name:name, type:typeStr, node:member, initializer:initializer});
                } else if (isOutput(member)) {
                     /* @Input() properties is expected to have an initalizer of the form: 
                        @Input() foo = new EventEmitter<Bar>();

                        We transform this into the function type (x: Bar)=>void
                    */
                    let typeStr = 'unknown';
                    if (member.initializer && ts.isNewExpression(member.initializer)) {
                        if (member.initializer.typeArguments && member.initializer.typeArguments.length > 0) {
                            const typeArg = member.initializer.typeArguments[0];
                            const innerType = this.getSource(typeArg);
                            typeStr = `(x: ${innerType}) => void`;
                        }
                    }
                    props.push({name:name, type:typeStr, node:member});

                } else {
                    if (isReadonly(member)) {
                        /* readonly members are immutable, so neither props or state */
                        constants.push({name:name, type:typeStr, node:member, initializer:initializer});
                    } else {
                        /* other properties are 'state' */
                        state.push({name:name, type:typeStr, node:member, initializer:initializer});
                    }
                }
            }
            if (ts.isSetAccessor(member)) {
                const name = this.getSource(member.name);
                if (isInput(member)) {
                    // type is the type of first param
                    const param1 = member.parameters[0];
                    const typeStr = param1.type ? this.getSource(param1.type) : this.inferType(param1);
                    props.push({name:name, type:typeStr, node:member});
                }
            }
            if (ts.isGetAccessor(member)) {
                const name = this.getSource(member.name);
                const typeStr = member.type ? this.getSource(member.type) : this.inferType(member);
                constants.push({name:name, type:typeStr, node:member});
            }
        }
        const ctor = cls.members.find(m => ts.isConstructorDeclaration(m)) as ts.ConstructorDeclaration;
        const ngOnInit = this.getMethodNamed(cls, 'ngOnInit');
        const ngOnDestroy = this.getMethodNamed(cls, 'ngOnDestroy');
        return new ComponentMembers(props, state, constants, ctor, ngOnInit, ngOnDestroy);
    }

    getMethodNamed(cls: ts.ClassDeclaration, name: string) {
        return cls.members.find(m => 
            ts.isMethodDeclaration(m) && 
            m.name.getText(this.sourceFile) === name) as ts.MethodDeclaration;
    }

    /* transfrom @Component() class into React component */
    transformComponentClass(cls: ts.ClassDeclaration, objLit: ts.ObjectLiteralExpression) {
        const modifiers = this.getArraySource(cls.modifiers);

        /* parse configuration */
        const decoratorArgument = parseStatic(objLit, this.sourceFile) as Component;
        if (decoratorArgument.styleUrls) {
            for (const styleUrl of decoratorArgument.styleUrls) {
                this.fileInfo.cssFilesReferenced.add(styleUrl);
            }
        }
        const members = this.scanComponentMembers(cls);
        const componentInfo = new ComponentInfo(this.fileInfo, decoratorArgument, members);

        const propsParam =this.generatePropsParameter(members.props);

        // transform component class into react function component
        const functionName = this.getSource(cls.name!);
        this.out.emitLine();
        this.out.emitLine(`${modifiers} function ${functionName}(${propsParam}) {`); 
        this.out.emitLine();

        /* generate code for service injections (constructor parameters) */
        if (members.ctor) {
            for (const p of members.ctor.parameters) {
                this.transformConstructorInjection(p);
            }
        }

        /* create state initializer if there are any state properties.
            If there is an inlined constructor
        */
        if (members.state.length > 0) {
            this.generateStateInitializer(members, componentInfo)
        }

        /* transform all other members of the component */
        for (const child of cls.members) {
            this.transformComponentMember(child, componentInfo);
        }

        this.out.emitLine();
        /* render template as tsx */
        const tsx = getTemplateAsTsx(decoratorArgument, this.sourceFile, componentInfo);
        this.out.emitLine(`\treturn (${tsx});`);
        this.out.emitLine(`}`);
        this.out.emitLine();
    }

    generateStateInitializer(members: ComponentMembers, componentInfo: ComponentInfo) {

        this.out.emitLine(`\tconst [${members.stateName}, ${members.setStateName}] = React.useState(()=>{`);

        const stateDecl = members.state.map(p => {
            const init = p.initializer !== undefined ? this.getSource(p.initializer) : `undefined as ${p.type}`;
            return `${p.name}: ${init}`;
        });
        const stateDeclCode = this.multilineIfLong(stateDecl, ',', '\n\t\t\t');

        this.out.emitLine(`\t\tconst initialState = {${stateDeclCode}};`);

        // inline constructor body (if any)
        
        if (members.ctor && hasNonEmptyBody(members.ctor.body)) {
            this.out.emitLine(`\t\t/* inlined constructor body */\n\t`);
            this.transformComponentMemberBody(members.ctor.body, componentInfo, true);
        }

        // inline ngOnInit() (if any)

        if (members.ngOnInit && hasNonEmptyBody(members.ngOnInit.body)) {
            this.out.emitLine(`\t\t/* inlined ngOnInit */\n\t`);
            this.transformComponentMemberBody(members.ngOnInit.body, componentInfo, true);
        }

        this.out.emitLine(`\t\treturn initialState;`);
        this.out.emitLine(`\t});`);
        this.out.emitLine();

        /* destructure state to local consts.
            This means we can refer to them directly from template
            and 'const' also ensure we don't change them directly
        */
        const stateNames = members.state.map(p => p.name).join(', ');
        this.out.emitLine(`\tconst { ${stateNames} } = ${members.stateName};`);
    }

    /* Props is generates as a destructured parameter, eg,
        Foo({bar, baz}: {bar: number, baz: string}) 

        Defualt values are supported like:

        Foo({bar = 17, baz}: {bar: number, baz: string}) 

    */
    generatePropsParameter(propMembers: MemberDeclaration[]) {
        if (propMembers.length === 0) {
            return '';
        }

        // generate props declaration
        const propsFields = propMembers.map(p => {
            // if the property has an initializer, we make it a default value
            const init = p.initializer ? ` = ${this.getSource(p.initializer)}` : '';
            return `${p.name}${init}`;
        });
        const propsFieldsCode = this.multilineIfLong(propsFields, ',', '\n\t\t');
        const propsTypes = propMembers.map(p => {
            const optFlag = p.initializer ? '?' : '';
            return `${p.name}${optFlag}: ${p.type}`
        });
        const propsTypesCode = this.multilineIfLong(propsTypes, ';', '\n\t\t');
        return `{${propsFieldsCode}}: {${propsTypesCode}}`;
    }

    /* Used for property sets, eg. props and state
        If the list becomes longer than a threshold, we put properties on individual lines
    */
    multilineIfLong(items: string[], sep: string, ln: string) {
        const singleLine = items.join(sep + ' ');
        if (singleLine.length < 20) {
            return ' ' + singleLine + ' ';
        }
        return ln + items.join(sep + ln) + ln;
    }

    transformComponentMember(member: ts.Node, componentInfo: ComponentInfo) {
        const members = componentInfo.members;
        if (ts.isMethodDeclaration(member)) {
            if (member.name.getText(this.sourceFile) === 'ngOnInit') {
                // ship processing ngOnInit body, since it is inlined in state initializer
                return;
            }

            // transform into function
            this.out.emit(this.getLeadingTrivia(member));
            const name = this.getSource(member.name);
            this.out.emit(`function ${name}`);
            // skip decorators, modifiers and name
            const preampNodes = (member.decorators ? 1 : 0) + (member.modifiers ? 1 : 0);
            const rest = member.getChildren(this.sourceFile).slice(preampNodes + 1);
            for (const node of rest) {
                this.transformComponentMemberBody(node, componentInfo, false)
            }
            return;

        } else if (ts.isGetAccessor(member)) {
            // transform get into constant
            this.out.emit(this.getLeadingTrivia(member));
            this.out.emit('const ');
            this.out.emit(this.getSource(member.name));

            /* if the getter body is a single return expression, we transform it into a const expression
                e.g. 'get foo() { return bar; }' is transformed to 'const foo = bar;'
            */
            if (hasNonEmptyBody(member.body)) {
                const stmt = member.body.statements[0];
                if (ts.isReturnStatement(stmt) && stmt.expression) {
                    this.out.emit(' = ');
                    const expr = stmt.expression;
                    this.transformComponentMemberBody(expr, componentInfo, false);
                    this.out.emit(';');
                    return;
                }
            }

            /*
                otherwise we inline the body (which is pretty ugly since locals are hoisted)
            */
            this.out.emit('\t/* getter transformed to immedately invoked function */');
            this.out.emit(' = (() =>');
            this.transformComponentMemberBody(member.body!, componentInfo, false)
            this.out.emit(')();');
            return;

        } else if (ts.isSetAccessor(member)) {
            const name = this.getSource(member.name);
            if (isInput(member)) {
                /*
                    @Input() set accessors are transformed into inline blocks
                    (Since input values are set as props)
                */
                this.out.emitLine(`\t/* inlined setter for ${name} */ `);
                this.transformComponentMemberBody(member.body!, componentInfo, false)
                this.out.emitLine('\t/* inlined setter end */');
                return;
            } else {
                /* transform setter into functions since setters are only supported on classes
                    'set foo' becomed 'set_foo'
                */
                this.out.emit(this.getLeadingTrivia(member));
                this.out.emit(`function set_${name}`);
                const rest = member.getChildren(this.sourceFile).slice(2);
                for (const node of rest) {
                    this.transformComponentMemberBody(node, componentInfo, false)
                }
                return;
            }
        } else if (ts.isPropertyDeclaration(member)) {
            if (members.props.some(p => p.node === member)) {
                // skip - is already processed as prop
                return;

            } else if (members.state.some(p => p.node === member)) {
                // skip - is already processed as state member
                return;

            } else {
                // transform property into const
                this.out.emit(this.getLeadingTrivia(member));
                this.out.emit(`const`);
                const rest = member.getChildren(this.sourceFile).slice(1);
                for (const node of rest) {
                    this.transformComponentMemberBody(node, componentInfo, false)
                }
                return
            }

        } else if (ts.isConstructorDeclaration(member)) {
            // ctor already processed
            return;

        } else {
            throw new Error(`Member not supported: ${ts.SyntaxKind[member.kind]}`)
        }
    }

    /* defualt to useContext */
    transformConstructorInjection(p: ts.ParameterDeclaration) {
        const varName = this.getSource(p.name);
        const type = this.getSource(p.type!); 
        const handler = injectionHandlers[type] ?? defaultInjectionHandler;
        const code = handler.transform(varName, type, p);
        if (handler.imports) {
                this.fileInfo.addImports(handler.imports)
        }
        this.out.emitLine('\t');
        this.out.emit(code);
    }

    transformComponentMemberBody(node: ts.Node, componentInfo: ComponentInfo, isStateInitializer: boolean) {
        const members = componentInfo.members;
        /* 
            if foo is in state, convert 'this.foo = bar'
            to 'setState({...state, foo: bar })'.
        */
        if (isAssignment(node) && isThisMember(node.left)) {
            this.out.emit(this.getLeadingTrivia(node));
            const name = this.getSource(node.left.name);
            if (members.stateNames.includes(name)) {
                if (isStateInitializer) {
                    /* If this is inside the state initializer, we cant call setState yet
                        instead we assign to the temporary stateInitializer variable 
                        */
                    this.out.emit(`initialState.${name} =`)
                    this.transformComponentMemberBody(node.right, componentInfo, isStateInitializer);
                } else {
                    /* turn state mutations into setState calls */
                    this.out.emit(`${members.setStateName}({...${members.stateName}, ${name}:`)
                    this.transformComponentMemberBody(node.right, componentInfo, isStateInitializer);
                    this.out.emit(`})`)
                }
                return;
            }
        }
        /* 
            convert 'this.foo' to 'foo.
        */
        if (isThisMember(node)) {
            this.out.emit(this.getLeadingTrivia(node));
            // we only process the name property, so 'this.' is skipped.
            this.transformComponentMemberBody(node.name, componentInfo, isStateInitializer);
            return;
        }

        /* type assertions of the form '<Foo>bar' is transformed into 'bar as Foo'
            since the first syntax is incompatible with tsx syntax 
            */
        if (ts.isTypeAssertionExpression(node)) {
            /* being a bit paranoid with the parentheses here
                 because im not sure about the precedence of the operators
            */
            this.out.emit(`((`);
            this.transformComponentMemberBody(node.expression, componentInfo, isStateInitializer);
            this.out.emit(`) as `);
            this.transformComponentMemberBody(node.type, componentInfo, isStateInitializer);
            this.out.emit(`)`);
            return;
        }

        const nodeText = node.getFullText(this.sourceFile);
        if (node.getChildCount(this.sourceFile) === 0) {
            this.out.emit(nodeText);
        }
        for (const child of node.getChildren(this.sourceFile)) {
            this.transformComponentMemberBody(child, componentInfo, isStateInitializer)
        }
    }
}


function getTemplateAsTsx(props: Component, sourceFile: ts.SourceFile, componentInfo: ComponentInfo) {
    if (props.templateUrl) {
        const abs = path.join(path.dirname(sourceFile.fileName), props.templateUrl);
        const file = fs.readFileSync(abs);
        const text = file.toString();
        return transformTemplateToTsx(text, abs, componentInfo);
    }
    if (props.template) {
        const template = props.template;
        return transformTemplateToTsx(template, sourceFile.fileName, componentInfo);
    }
    return '';
}

/*
    Add necessary imports
    - React
    - All referenced components
    - Referenced CSS files
    - Other imports added by configurations
*/
function addImports(fileInfo: FileInfo, out: TextBuffer) {
    function toUnixPath(file: string) {
        return file.replace(/\\/g, '/');
    }
    function toImportPath(file: string) {
        const ext = path.extname(file);
        file = file.substring(0, file.length - ext.length);
        file = toUnixPath(file);
        if (!(file.startsWith('.'))) {
            file = './' + file;
        }
        return file;
    }
    function addImport(relPath: string, names: string[]) {
        out.prepend(`import {${names.join(', ')}} from '${toImportPath(relPath)}';\n`);
    }

    const fileName = fileInfo.fileName;

    /* import used components */
    for (const component of fileInfo.componentsReferenced.values()) {
        if (component.file !== fileName) {
            const relPath = path.relative(path.dirname(fileName), component.file);
            addImport(relPath, [component.name]);
        }
    }

    // import CSS (styleUrls are specified as relative to the component, so we dont need to change them)
    for (const styleUrl of fileInfo.cssFilesReferenced.values()) {
            out.prepend(`import '${styleUrl}';\n`);
    }

    for (const [file, names] of fileInfo.additionalImports.entries()) {
        // file names are relative to the project src root
        const absPath = path.join(fileInfo.projectInfo.srcRoot, file);
        const relPath = path.relative(path.dirname(fileName), absPath);
        const nameList = Array.from(names);
        addImport(relPath, nameList);
    }
    out.prepend(`import React from 'react';\n`);
}