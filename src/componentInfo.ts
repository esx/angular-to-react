import * as ts from 'typescript';
import * as ac from '@angular/compiler';
import { Component } from './angularInterfaces';

/* Context information passed down through the transformation
*/

export type ComponentMap = Map<string, ComponentRecord>;

export class ComponentRecord {
    constructor(readonly selector: string, readonly name: string, readonly file: string) { }
}

export class ProjectInfo {
    constructor(
        readonly typeChecker: ts.TypeChecker,
        readonly srcRoot: string, 
        readonly componentMap: ComponentMap) { }
        matchesComponentSelector(element: ac.TmplAstElement) {
            /* Currently only supports tag-name selectors */
            const tagName = element.name;
            return this.componentMap.get(tagName);
        }
}

export type Import = {names: string[], file: string};

export class FileInfo {
    componentsReferenced = new Map<string,    ComponentRecord>();
    cssFilesReferenced = new Set<string>();
    additionalImports = new Map<string,    Set<string>>();
    constructor(readonly fileName: string, readonly projectInfo: ProjectInfo) { }

    addImports(imports: Import[]) {
        for (const imp of imports) {
            this.addImport(imp);
        }
    }
    addImport(imp: Import) {
        const names = this.additionalImports.get(imp.file)
        if (names) {
            imp.names.forEach(name => names.add(name));
        } else {
            this.additionalImports.set(imp.file, new Set(imp.names));
        }
    }
}

export type MemberDeclaration = {name: string, type: string, node: ts.ClassElement, initializer?: ts.Expression};

export class ComponentMembers{
    propNames;
    stateNames;
    names;
    stateName;
    setStateName;
    constructor(
            readonly props: MemberDeclaration[], 
            readonly state: MemberDeclaration[], 
            readonly constants: MemberDeclaration[],
            readonly ctor?: ts.ConstructorDeclaration,
            readonly ngOnInit?: ts.MethodDeclaration,
            readonly ngOnDestroy?: ts.MethodDeclaration
            ) { 
        this.propNames = props.map(prop => prop.name);
        this.stateNames = state.map(prop => prop.name);
        this.names = this.propNames.concat(this.stateNames).concat(constants.map(l => l.name));
        const safeName = (name: string): string => this.names.includes(name) ? safeName('$' + name) : name;
        this.stateName = safeName('state');
        this.setStateName = safeName('setState');
    }
}

export class ComponentInfo {
        constructor(
            readonly fileInfo: FileInfo,    
            readonly decoratorArgument: Component, 
            readonly members: ComponentMembers) { }
}

