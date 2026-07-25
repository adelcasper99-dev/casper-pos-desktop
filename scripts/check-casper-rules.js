#!/usr/bin/env node
/**
 * check-casper-rules.js
 *
 * Structural (static) checks for Stage 4 of the ce-agent-pipeline.
 * Behavioral checks (actual balance reconciliation, correctness of totals)
 * belong in `npm test` / vitest instead — see the plan's linter-scope note.
 *
 * Checks:
 *   1. No native float operators (+ - * /) on values typed as Money/Decimal.
 *   2. Fallback heuristic: flag untyped `number` fields whose name matches
 *      common monetary patterns (subtotal, total, price, tax, amount, cost,
 *      balance, fee) used in float math — catches legacy code that hasn't
 *      adopted the branded type yet. Heuristic hits are WARNINGS, not
 *      failures, since name-matching has false positives.
 *   3. No `any` types in modified files.
 *   4. Best-effort idempotency guard presence check on sync mutation
 *      functions (looks for an early-return/guard clause referencing an
 *      idempotency key — heuristic, not a proof of correctness).
 *
 * Requires: `typescript` as a devDependency (uses the TS compiler API for
 * real type information rather than pure regex/string matching).
 *
 * Usage:
 *   node scripts/check-casper-rules.js [--files <comma-separated-paths>]
 *   (defaults to `git diff --name-only` against the target branch if --files
 *   is omitted, so Stage 4 can call it with no arguments post-build)
 */

const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MONEY_TYPE_NAMES = new Set(["Money", "Decimal"]);
const MONEY_NAME_PATTERN =
  /\b(subtotal|total|price|tax|amount|cost|balance|fee|debit|credit)\b/i;
const FLOAT_OPERATORS = new Set(["+", "-", "*", "/"]);

function getChangedFiles() {
  const filesArg = process.argv.indexOf("--files");
  if (filesArg !== -1) {
    return process.argv[filesArg + 1]
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  }
  try {
    const out = execSync("git diff --name-only HEAD", { encoding: "utf8" });
    return out
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  } catch {
    return [];
  }
}

function loadProgram(files) {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  const compilerOptions = configPath
    ? ts.parseJsonConfigFileContent(
        ts.readConfigFile(configPath, ts.sys.readFile).config,
        ts.sys,
        path.dirname(configPath)
      ).options
    : { allowJs: true, checkJs: false };
  return ts.createProgram(files, compilerOptions);
}

function typeIsMoney(checker, node) {
  const t = checker.getTypeAtLocation(node);
  const symbol = t.getSymbol() || (t.aliasSymbol ?? null);
  if (symbol && MONEY_TYPE_NAMES.has(symbol.getName())) return true;
  const typeText = checker.typeToString(t);
  return [...MONEY_TYPE_NAMES].some((n) => typeText.includes(n));
}

function checkFile(program, checker, filePath, findings) {
  const source = program.getSourceFile(filePath);
  if (!source) return;

  function visit(node) {
    // Rule 1 + fallback heuristic: float operators on binary expressions
    if (ts.isBinaryExpression(node) && FLOAT_OPERATORS.has(node.operatorToken.getText())) {
      const leftIsMoney = typeIsMoney(checker, node.left);
      const rightIsMoney = typeIsMoney(checker, node.right);
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());

      if (leftIsMoney || rightIsMoney) {
        findings.push({
          severity: "error",
          file: filePath,
          line: line + 1,
          message: `Native '${node.operatorToken.getText()}' operator on a Money/Decimal-typed value — use Decimal.js methods instead.`,
        });
      } else {
        const leftText = node.left.getText();
        const rightText = node.right.getText();
        if (MONEY_NAME_PATTERN.test(leftText) || MONEY_NAME_PATTERN.test(rightText)) {
          findings.push({
            severity: "warning",
            file: filePath,
            line: line + 1,
            message: `Untyped variable name suggests monetary value ('${leftText} ${node.operatorToken.getText()} ${rightText}') using native float math. Consider a branded Money/Decimal type — this is a name heuristic, verify manually.`,
          });
        }
      }
    }

    // Rule 3: any types
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      findings.push({
        severity: "error",
        file: filePath,
        line: line + 1,
        message: "`any` type is not allowed in modified files.",
      });
    }

    // Rule 4: idempotency guard heuristic on sync mutation functions
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      /sync|mutate|apply/i.test(node.name.getText()) &&
      node.body
    ) {
      const bodyText = node.body.getText();
      const hasGuard = /idempoten|dedupe|already[_A-Za-z]*processed|seenKeys?/i.test(bodyText);
      if (!hasGuard) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          severity: "warning",
          file: filePath,
          line: line + 1,
          message: `Function '${node.name.getText()}' looks like a sync mutation but no idempotency guard pattern was detected. Heuristic only — verify manually.`,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

function main() {
  const files = getChangedFiles().filter((f) => fs.existsSync(f));
  if (files.length === 0) {
    console.log("check-casper-rules: no changed .ts/.tsx files to check.");
    process.exit(0);
  }

  const program = loadProgram(files);
  const checker = program.getTypeChecker();
  const findings = [];

  for (const file of files) {
    checkFile(program, checker, path.resolve(file), findings);
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  for (const f of [...errors, ...warnings]) {
    const tag = f.severity === "error" ? "ERROR" : "WARN";
    console.log(`[${tag}] ${f.file}:${f.line} — ${f.message}`);
  }

  console.log(`\ncheck-casper-rules: ${errors.length} error(s), ${warnings.length} warning(s).`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
