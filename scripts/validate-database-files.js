#!/usr/bin/env node

/**
 * Database File Validation Script
 *
 * Prevents accidental inclusion of temporary database files in Git commits.
 * Specifically blocks: *.db-wal, *.db-shm, *.db-journal
 * Allows: prisma/prisma/dev.db (main development database)
 *
 * Usage:
 *   node scripts/validate-database-files.js [--staged|--commit <sha>|--all]
 *
 * Options:
 *   --staged    Check staged files (used by pre-commit hook)
 *   --commit    Check all files in a specific commit
 *   --all       Check all files in repository (CI/CD use)
 *   --help      Show this help
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = Violations found
 *   2 = Error running validation
 */

const { execSync } = require('child_process');
const path = require('path');

// Configuration
const CONFIG = {
    // Files/directories to ignore (relative to repo root)
    ignorePatterns: [
        'prisma/prisma/dev.db', // Allow main dev database
    ],
    // Database file patterns to block (regex)
    dbPattern: /\.db(-wal|-shm|-journal)?$/i,
    // Additional binary patterns that might be problematic
    binaryPatterns: [
        /\.exe$/i,
        /\.dll$/i,
        /\.so$/i,
        /\.dylib$/i,
        /\.bin$/i,
        /\.dat$/i,
    ]
};

function log(message, type = 'info') {
    const prefix = {
        'error': '❌',
        'warn': '⚠️',
        'info': 'ℹ️',
        'success': '✅'
    }[type] || 'ℹ️';
    console.log(`${prefix} ${message}`);
}

function getStagedFiles() {
    try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return output.split('\n').filter(f => f.trim() && !f.startsWith('warning:'));
    } catch (error) {
        log('Failed to get staged files: ' + error.message, 'error');
        return [];
    }
}

function getCommitFiles(commitSha) {
    try {
        const output = execSync(`git show --name-only --pretty=format: ${commitSha}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return output.split('\n').filter(f => f.trim() && !f.startsWith('warning:'));
    } catch (error) {
        log(`Failed to get files for commit ${commitSha}: ${error.message}`, 'error');
        return [];
    }
}

function getAllTrackedFiles() {
    try {
        const output = execSync('git ls-files', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return output.split('\n').filter(f => f.trim() && !f.startsWith('warning:'));
    } catch (error) {
        log('Failed to get tracked files: ' + error.message, 'error');
        return [];
    }
}

function isAllowed(filePath) {
    // Check if file matches any ignore pattern
    return CONFIG.ignorePatterns.some(pattern => {
        if (typeof pattern === 'string') {
            return filePath === pattern || filePath.startsWith(pattern + '/');
        }
        return pattern.test(filePath);
    });
}

function checkForDatabaseFiles(files) {
    const violations = [];

    for (const file of files) {
        // Skip if allowed
        if (isAllowed(file)) {
            continue;
        }

        // Check if it's a database file
        if (CONFIG.dbPattern.test(file)) {
            violations.push({
                file,
                reason: 'Database file (should not be version-controlled)'
            });
            continue;
        }

        // Check for other problematic binary files
        for (const pattern of CONFIG.binaryPatterns) {
            if (pattern.test(file)) {
                violations.push({
                    file,
                    reason: 'Potentially problematic binary file'
                });
                break;
            }
        }
    }

    return violations;
}

function checkForConflictMarkers(files) {
    const conflicts = [];

    for (const file of files) {
        // Skip non-text files and markdown
        if (file.endsWith('.md') || file.endsWith('.png') || file.endsWith('.jpg') ||
            file.endsWith('.jpeg') || file.endsWith('.gif') || file.endsWith('.svg') ||
            file.endsWith('.ico') || file.endsWith('.woff') || file.endsWith('.woff2') ||
            file.endsWith('.ttf') || file.endsWith('.eot') || file.endsWith('.js') ||
            file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.tsx')) {
            // Note: We still check .js/.ts files because they commonly have conflicts
            // But we'll be more precise about marker detection below
        }

        try {
            const content = execSync(`git show :${file}`, { encoding: 'utf-8' });

            // Check for conflict markers at the START of lines (with optional whitespace)
            // This avoids false positives from strings containing these patterns
            const lines = content.split('\n');
            const markers = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                
                // Only flag if line starts with conflict marker (after optional whitespace)
                if (trimmed.startsWith('<<<<<<<') || trimmed.startsWith('=======') || trimmed.startsWith('>>>>>>>')) {
                    markers.push({ line: i + 1, content: line.trim() });
                }
            }

            if (markers.length > 0) {
                conflicts.push({
                    file,
                    markers
                });
            }
        } catch (error) {
            // File might be binary or deleted, skip it
        }
    }

    return conflicts;
}

function printViolations(violations) {
    log('Found prohibited files:', 'error');
    violations.forEach(v => {
        log(`  ${v.file} - ${v.reason}`, 'error');
    });
    log('');
    log('To fix:', 'warn');
    log('  1. Remove from staging: git reset HEAD <file>', 'warn');
    log('  2. Add to .gitignore: echo "<file>" >> .gitignore', 'warn');
    log('  3. If file was created during merge, resolve by deletion: git rm --cached <file>', 'warn');
}

function printConflictMarkers(conflicts) {
    log('Found conflict markers in code files:', 'error');
    conflicts.forEach(c => {
        log(`  ${c.file}:`, 'error');
        c.markers.forEach(m => {
            log(`    Line ${m.line}: ${m.content}`, 'error');
        });
    });
    log('');
    log('Resolve conflicts before committing:', 'warn');
    log('  1. Open the file and edit to keep desired changes', 'warn');
    log('  2. Remove all <<<<<<<, =======, >>>>>>> markers', 'warn');
    log('  3. Stage the resolved file: git add <file>', 'warn');
}

function main() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('--help') || args.includes('-h');

    if (helpFlag) {
        console.log(`
Database File Validation Script

Usage:
  node scripts/validate-database-files.js [--staged|--commit <sha>|--all]

Options:
  --staged    Check staged files (used by pre-commit hook)
  --commit    Check all files in a specific commit
  --all       Check all tracked files in repository
  --help      Show this help

Examples:
  # Pre-commit hook (automatic)
  node scripts/validate-database-files.js --staged

  # CI/CD check
  node scripts/validate-database-files.js --all

  # Check specific commit
  node scripts/validate-database-files.js --commit abc123

Exit codes:
  0 = All validations passed
  1 = Violations found
  2 = Error running validation
        `.trim());
        process.exit(0);
    }

    let files = [];
    let mode = 'staged';

    if (args.includes('--staged')) {
        files = getStagedFiles();
        mode = 'staged';
    } else if (args.includes('--commit')) {
        const commitIndex = args.indexOf('--commit');
        const commitSha = args[commitIndex + 1];
        if (!commitSha) {
            log('Error: --commit requires a commit SHA', 'error');
            process.exit(2);
        }
        files = getCommitFiles(commitSha);
        mode = 'commit';
    } else if (args.includes('--all')) {
        files = getAllTrackedFiles();
        mode = 'all';
    } else {
        // Default to staged if no args
        files = getStagedFiles();
        mode = 'staged';
    }

    if (files.length === 0) {
        log('No files to validate', 'info');
        process.exit(0);
    }

    log(`Checking ${files.length} file(s) [${mode} mode]...`, 'info');

    // Check for database files
    const dbViolations = checkForDatabaseFiles(files);

    // Check for conflict markers (only in staged/commit modes)
    let conflictViolations = [];
    if (mode !== 'all') {
        conflictViolations = checkForConflictMarkers(files);
    }

    // Report results
    if (dbViolations.length > 0 || conflictViolations.length > 0) {
        log('');
        log('❌ VALIDATION FAILED', 'error');
        log('');

        if (dbViolations.length > 0) {
            printViolations(dbViolations);
        }

        if (conflictViolations.length > 0) {
            printConflictMarkers(conflictViolations);
        }

        process.exit(1);
    }

    log('✅ All validations passed!', 'success');
    process.exit(0);
}

// Run
main().catch(error => {
    log('Unexpected error: ' + error.message, 'error');
    process.exit(2);
});