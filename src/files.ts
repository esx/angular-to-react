import * as path from 'path';
import * as fs from 'fs';


function walkSync(currentDirPath: string, callback: (file: string, stat: fs.Stats)=>void) {
    fs.readdirSync(currentDirPath).forEach(name => {
        const filePath = path.join(currentDirPath, name);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            callback(filePath, stat);
        } else if (stat.isDirectory()) {
            walkSync(filePath, callback);
        }
    });
}
    
export function getFiles(root: string): string[] {
    const all: string[] = [];
    walkSync(root, (file)=>{
        all.push(file);
    });
    return all;
}