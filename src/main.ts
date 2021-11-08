import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { findComponents, transformComponentFile } from './transform';
import { getFiles } from './files';
import { ComponentRecord, ProjectInfo } from './componentInfo';
import { migration } from './migration';

type Migration = { srcRoot: string, targetRoot: string };

function migrateProject(migration: Migration): void {
    const srcRoot = migration.srcRoot;
    const targetRoot = migration.targetRoot;
    const overwriteFilter = (_path: string) => true;

    const options: ts.CompilerOptions = {
        noEmitOnError: true,
        noImplicitAny: true,
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        resolveJsonModule: true
    };
    const fileNames = getFiles(srcRoot);
    const codeFiles = fileNames.filter(f => path.extname(f) === '.ts');
    const program = ts.createProgram(codeFiles, options);
    const typeChecker = program.getTypeChecker()

    /* first pass: locate all components */
    const filesWithComponents = new Set<string>();
    const componentMap = new Map<string, ComponentRecord>()
    for (const file of codeFiles) {
        const fileNode = program.getSourceFile(file)!;
        const components = findComponents(fileNode);
        if (components.length > 0) {
            filesWithComponents.add(file);
            for (const component of components) {
                componentMap.set(component.selector, component);
            }
        }
    }

    const projectInfo = new ProjectInfo(typeChecker, srcRoot, componentMap);

    /* transform files */
    for (const sourceFile of fileNames) {
        const rel = path.relative(srcRoot, sourceFile);
        const targetAbs = path.join(targetRoot, rel);
        const targetDir = path.dirname(targetAbs);
        fs.mkdirSync(targetDir, { recursive: true });
        if (filesWithComponents.has(sourceFile)) {
            /* transform files with components */

            const f = program.getSourceFile(sourceFile)!;
            const {text} = transformComponentFile(f, projectInfo);
            // Should only be tsx if contains a component
            const tsxAbs = targetAbs + 'x';
            if (overwriteFilter(tsxAbs)) {
                fs.writeFileSync(tsxAbs, text);
            }
        } else if (sourceFile.endsWith('.component.html')) {
            // we dont copy HTML files, since we assume thay are templates.

        } else {
            // copy everything else
            if (overwriteFilter(targetAbs)) {
                fs.copyFile(sourceFile, targetAbs, ()=>{ throw new Error(`File copy failed.`); });
            }
        }
    }
}

function main() {
    migrateProject(migration);
}


main();