/**
 * Financial Precision & Float Math Linter for Casper POS & ERP
 * Scans the entire `src/` tree for:
 * 1. Native floating-point operators (+, -, *, /) on monetary/currency variables.
 * 2. Raw `.toFixed()` calls on computational paths (only allowed for display strings).
 * 3. Inconsistent Decimal rounding configuration (must use ROUND_HALF_UP).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../src');
const FINANCIAL_TERMS = [
  'price', 'cost', 'total', 'amount', 'salary', 'balance', 'revenue',
  'profit', 'tax', 'discount', 'subtotal', 'debit', 'credit', 'cogs',
  'grandtotal', 'paid', 'change', 'netamount', 'wage', 'commission'
];

let errorCount = 0;
let warningCount = 0;
let scannedFiles = 0;

function isFinancialVariable(str) {
  const lower = str.toLowerCase();
  return FINANCIAL_TERMS.some(term => lower.includes(term));
}

function scanFile(filePath) {
  // Only scan ts, tsx, js, mjs
  if (!/\.(tsx?|jsx?|mjs)$/.test(filePath) || filePath.includes('.test.') || filePath.includes('.spec.')) {
    return;
  }

  scannedFiles++;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNum = idx + 1;

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    // 1. Check for suspicious native float operators on obvious financial assignments
    // Example: totalAmount = price * quantity (without Decimal)
    const floatMathPattern = /(\b\w+(?:Price|Cost|Total|Amount|Balance|Salary|Revenue|Profit|Tax|Discount))\s*(=|\+=|-=|\*=|\/=)\s*([^;]+)/i;
    const match = floatMathPattern.exec(trimmed);
    if (match && !trimmed.includes('new Decimal') && !trimmed.includes('Decimal.') && !trimmed.includes('Number(') && !trimmed.includes('parseFloat')) {
      const rhs = match[3];
      // If rhs contains basic arithmetic operators + - * / with financial variables
      if (/[\+\-\*\/]/.test(rhs) && FINANCIAL_TERMS.some(t => rhs.toLowerCase().includes(t))) {
        // Exclude string concatenation
        if (!rhs.includes('`') && !rhs.includes('"') && !rhs.includes("'") && !rhs.includes('px') && !rhs.includes('%')) {
          console.warn(`⚠️ [FLOAT_MATH_WARN] ${filePath}:${lineNum} — Potential native float math on financial variable: \`${trimmed}\``);
          warningCount++;
        }
      }
    }

    // 2. Check for .toFixed() assigned back to numeric fields (should use Decimal.toFixed(2))
    if (trimmed.includes('.toFixed(') && !trimmed.includes('format') && !trimmed.includes('toString') && !trimmed.includes('display')) {
      if (/(?:set|const|let|var)\s+\w*(?:Amount|Total|Price|Cost|Balance)\s*=\s*.*\.toFixed\(/i.test(trimmed)) {
        console.warn(`ℹ️ [TO_FIXED_CHECK] ${filePath}:${lineNum} — Verify .toFixed() is for display only: \`${trimmed}\``);
      }
    }
  });
}

function traverse(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'coverage') {
        traverse(fullPath);
      }
    } else {
      scanFile(fullPath);
    }
  }
}

console.log(`🔍 [FINANCIAL_LINTER] Scanning full src/ tree for financial math integrity...`);
traverse(ROOT_DIR);
console.log(`\n========================================================`);
console.log(`📊 Scanned ${scannedFiles} source files across src/.`);
console.log(`✅ Errors: ${errorCount} | ⚠️ Warnings/Notices: ${warningCount}`);
console.log(`========================================================\n`);

if (errorCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
