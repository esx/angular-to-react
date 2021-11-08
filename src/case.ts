

function capitalize(name: string) {
    return name[0].toUpperCase() + name.substring(1);
}

export function kebebCaseToPascalCase(name: string) {
    const parts = name.split('-');
    return parts.map(p => capitalize(p)).join('');
}

export function kebabCaseToCamelCase(name: string) {
    const parts = name.split('-');
    return parts[0] + parts.slice(1).map(p => capitalize(p)).join('');
}