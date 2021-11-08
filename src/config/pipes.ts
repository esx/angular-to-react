import { Import } from '../componentInfo';

/*
    Configure handling of pipes in templates.
    Default behavior is transforming into a function call, i.e. 'foo | bar' to 'bar(foo)'
    A configuration can override this transformation and/or include library imports to be added to files using the pipe.

    File names are relative to the project src root
*/
type PipeHandler = {
    transform?: (inner: string, pipeName: string)=>string; 
    imports?: Import[] 
};
export const pipeHandlers: { [key:string]: PipeHandler } = {
    'uppercase' : { imports: [{names: ['uppercase'], file: 'pipes.ts'}] },
    'keyvalue' : { imports: [{names: ['keyvalue'], file: 'pipes.ts'}] },
    'text' : { 
        transform: (inner: string) => `<TextComponent name={${inner}} />`, 
        imports: [{names: ['TextComponent'], file: 'TextComponent.ts'}] }
}

export const defaultPipeHandler = { 
    transform:(inner: string, pipeName: string) => `${pipeName}(${inner})` 
};

