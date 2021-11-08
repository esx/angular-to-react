import * as ts from 'typescript';
import { ProjectInfo } from '../componentInfo';
import { findComponents, transformComponentFile } from '../transform';

function compileString(source: string) {
    const fileName = 'foo.ts';
    const files = new Map([['foo.ts', source]]);
    const program = compile(files);
    const sourceFile = program.getSourceFile(fileName)!;
    return {sourceFile: sourceFile, typeChecker: program.getTypeChecker()};
}

function compile(files: Map<string, string>) {
    const target = ts.ScriptTarget.ES5;
    const options: ts.CompilerOptions = {
        noEmitOnError: true,
        noImplicitAny: true,
        target: target,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        resolveJsonModule: true,
      };
      /* creates a compiler host which present the sting map as if it was a file system */
      const compilerHost: ts.CompilerHost = {
        getSourceFile: (fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void) => {
            const text = files.get(fileName);
            if (!text) {
                return undefined;
            }
            return ts.createSourceFile(fileName, text, languageVersion); 
        },
        getDefaultLibFileName: (defaultLibOptions: ts.CompilerOptions) => '/' + ts.getDefaultLibFileName(defaultLibOptions),
        writeFile: () => { /* do nothing */ }, 
        getCurrentDirectory: () => '/',
        getDirectories: (path: string) => [],
        fileExists: (fileName: string) => { return files.has(fileName); },
        readFile: (fileName: string) => { return files.get(fileName); },
        getCanonicalFileName: (fileName: string) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        getEnvironmentVariable: () => '' // do nothing
    };
    const fileNames = Array.from(files.keys());
    return ts.createProgram(fileNames, options, compilerHost);
}

test('scan components', () => {
    const tmpl = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { }
    `;
    const {sourceFile, typeChecker} = compileString(tmpl);
    const comps = findComponents(sourceFile);
    expect(comps.length).toBe(1);
    const comp = comps[0];
    expect(comp.file).toBe('foo.ts');
    expect(comp.selector).toBe('foo-bar');
    expect(comp.name).toBe('FooBarComponent');
});

function compareCode(actual: string, expected: string) {
    function normalize(code: string) { return code.replace(/\s+/g, ' ').trim(); }
    expect(normalize(actual)).toBe(normalize(expected));
}

function transfromCode(code: string) {
    const {sourceFile, typeChecker} = compileString(code);
    const result = transformComponentFile(sourceFile, new ProjectInfo(typeChecker, '', new Map()));
    return result.text;
}

test('transform component', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        return (); 
    }`);
});

test('transform component with a getter named "state" ', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        statevar = 42;
        get state() { return 27; }
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        const [$state, setState] = React.useState(()=>{ 
            const initialState =  { statevar: 42 };
            return initialState; 
        });
        const { statevar } = $state;
        const state = 27;
        return (); 
    }`);
});

test('transform component with a multiline getter ', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        get foo(): number {
            const baz = 27; 
            return baz; 
        }
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        const foo /* getter transformed to immedately invoked function */ = (() => {
            const baz = 27; 
            return baz; 
        })();
        return (); 
    }`);
});

test('transform component with an Input() property with a default value" ', () => {
    /*
        An @Input() property with a default value 
        should be transfromed to an optional props. 
    */
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        @Input() width = 16;
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent({ width = 16 }: { width?: number }) { 
        return (); 
    }`);
});

test('transform component with an Output() property" ', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        @Output() zap = new EventEmitter<number>();
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent({ zap }: { zap: (x: number) => void }) { 
        return (); 
    }`);
});

test('transform component readonly property" ', () => {
    /*
        A readonly property should be a const, not a props or state member.
    */
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        readonly width = 16;
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        const width = 16;
        return (); 
    }`);
});

test('constructor body be inlined in the state initializer ', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        baz!: number;
        constructor() {
            this.baz = 27;
        }
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        const [state, setState] = React.useState(()=>{ 
            const initialState = { baz: undefined as number };
            /* inlined constructor body */ 
            { initialState.baz = 27; } 
            return initialState; });
        const { baz } = state;
        return ();
    }`);
});

test('ngOnInit should be inlined in the state initializer ', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        baz!: number;
        ngOnInit() {
            this.baz = 27;
        }
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        const [state, setState] = React.useState(()=>{ 
            const initialState = { baz: undefined as number };
            /* inlined ngOnInit */ 
            { initialState.baz = 27; } 
            return initialState; });
        const { baz } = state;
        return ();
    }`);
});


test('Assigning to state should be turned info setState', () => {
    const source = `
    @Component({selector: 'foo-bar'})
    export class FooBarComponent { 
        baz = 17;
        foo() {
            this.baz = 27;
        }
    }
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    export function FooBarComponent() { 
        const [state, setState] = React.useState(()=>{ 
            const initialState = { baz: 17 };
            return initialState; 
        });
        const { baz } = state;
        function foo() {
            setState({...state, baz: 27});
        }
        return ();
    }`);
});



test('Should remove angular imports', () => {
    const source = `
    import { Foo } from '@angular/bar';
    import { SomethingUseful } from '.baz';
    `;
    const result = transfromCode(source);
    compareCode(result, `
    import React from 'react';
    import { SomethingUseful } from '.baz';
    `);
});