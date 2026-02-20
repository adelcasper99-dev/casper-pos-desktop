const fs = require('fs');
const path = require('path');

function getFiles(dir) {
    let files = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            files = files.concat(getFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            files.push(fullPath);
        }
    }
    return files;
}

function scanImports(files) {
    const dependencies = new Set();
    const importRegex = /from ['"]([^'.\/][^'"]+)['"]/g;

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            let dep = match[1];
            // Handle scoped packages like @tanstack/react-query
            if (dep.startsWith('@')) {
                const parts = dep.split('/');
                if (parts.length >= 2) {
                    dep = `${parts[0]}/${parts[1]}`;
                }
            } else {
                dep = dep.split('/')[0];
            }
            dependencies.add(dep);
        }
    }
    return Array.from(dependencies);
}

const srcPath = path.join(process.cwd(), 'src');
const files = getFiles(srcPath);
const deps = scanImports(files);

// Filter out built-ins and aliases
const builtins = ['fs', 'path', 'crypto', 'os', 'child_process', 'util', 'events', 'http', 'https', 'next', 'react', 'react-dom'];
const aliases = ['@'];

const externalDeps = deps.filter(d => !builtins.includes(d) && !aliases.some(a => d.startsWith(a)));

console.log('Detected dependencies:');
console.log(JSON.stringify(externalDeps, null, 2));

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const installed = new Set([...Object.keys(packageJson.dependencies || {}), ...Object.keys(packageJson.devDependencies || {})]);

const missing = externalDeps.filter(d => !installed.has(d));
console.log('\nMissing dependencies:');
console.log(JSON.stringify(missing, null, 2));
