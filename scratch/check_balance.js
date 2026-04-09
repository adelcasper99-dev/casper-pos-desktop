import fs from 'fs';

const content = fs.readFileSync('f:/casper desktop/casper-pos-desktop/src/components/inventory/PurchasesTab.tsx', 'utf8');

let braces = 0;
let parens = 0;
let brackets = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') braces++;
        if (char === '}') braces--;
        if (char === '(') parens++;
        if (char === ')') parens--;
        if (char === '[') brackets++;
        if (char === ']') brackets--;
    }
    if (braces < 0 || parens < 0 || brackets < 0) {
        console.log(`Mismatch found at line ${i + 1}: B:${braces} P:${parens} K:${brackets}`);
        // Reset to prevent cascade if logic allows, but usually this is the error point
    }
}

console.log(`Final totals - Braces: ${braces}, Parens: ${parens}, Brackets: ${brackets}`);
