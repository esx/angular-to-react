import * as ts from 'typescript';
import { Import } from '../componentInfo';

/*
    Configure handling of dependency injection in components constructors
    Default behavior is transforming into a 'useContext', i.e. 'foo: FooService' parameter into 'const foo = useContext(FooService) '
    A configuration can override this transformation and/or include library imports.

    File names are relative to the project src root
*/
type InjectionHandler = {
    transform: (name: string, type: string, parameter: ts.ParameterDeclaration) => string; 
    imports?: Import[] 
};
export const injectionHandlers: { [key:string]: InjectionHandler } = {
    'ElementRef' : { 
        transform: (name: string, type: string, parameter: ts.ParameterDeclaration) => {
            return `const ${name} =  React.createRef(); /* TODO */ `;
        }
    },
    'ChangeDetectorRef': {
        transform: (name: string, type: string) =>  `const ${name} = null; /* No equivalent to ChangeDetectorRef in React */`
    }
}

export const defaultInjectionHandler = {
    transform: (name: string, type: string) => `const ${name} = React.useContext(${type});`
}