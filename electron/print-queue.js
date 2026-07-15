const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class PrintQueue {
    constructor(userDataPath, logFn) {
        this.log = logFn || console.log;
        const dbDir = path.join(userDataPath, 'print-queue');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        const dbPath = path.join(dbDir, 'print-queue.db');
        this.db = new Database(dbPath);
        
        // Enforce WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS print_jobs (
                id           TEXT PRIMARY KEY,
                job_type     TEXT NOT NULL CHECK(job_type IN ('receipt','a4','barcode','label')),
                html         TEXT NOT NULL,
                printer      TEXT,
                paper_width  INTEGER,
                status       TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK(status IN ('PENDING','PROCESSING','DONE','FAILED','FAILED_PERMANENT')),
                retry_count  INTEGER NOT NULL DEFAULT 0,
                next_retry_at INTEGER,
                created_at   INTEGER NOT NULL,
                completed_at INTEGER,
                error_msg    TEXT
            )
        `);
        // Index for performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_pj_status ON print_jobs(status, next_retry_at)
        `);
    }

    enqueue(id, jobType, html, printer, paperWidth) {
        const stmt = this.db.prepare(`
            INSERT INTO print_jobs (id, job_type, html, printer, paper_width, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, jobType, html, printer, paperWidth || null, Date.now());
        return id;
    }

    dequeueNext() {
        const now = Date.now();
        const stmt = this.db.prepare(`
            SELECT * FROM print_jobs
            WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= ?)
            ORDER BY created_at ASC
            LIMIT 1
        `);
        return stmt.get(now);
    }

    markProcessing(id) {
        const stmt = this.db.prepare(`
            UPDATE print_jobs
            SET status = 'PROCESSING'
            WHERE id = ?
        `);
        stmt.run(id);
    }

    markDone(id) {
        const stmt = this.db.prepare(`
            UPDATE print_jobs
            SET status = 'DONE', completed_at = ?
            WHERE id = ?
        `);
        stmt.run(Date.now(), id);
    }

    markFailed(id, errorMsg, maxRetries = 3) {
        const getStmt = this.db.prepare(`SELECT retry_count FROM print_jobs WHERE id = ?`);
        const job = getStmt.get(id);
        if (!job) return;

        const nextRetryCount = job.retry_count + 1;
        if (nextRetryCount >= maxRetries) {
            const stmt = this.db.prepare(`
                UPDATE print_jobs
                SET status = 'FAILED_PERMANENT', error_msg = ?
                WHERE id = ?
            `);
            stmt.run(errorMsg, id);
            this.log(`Job ${id} permanently failed after ${maxRetries} retries.`);
        } else {
            const baseDelay = 2000;
            const exponentialDelay = baseDelay * Math.pow(2, nextRetryCount);
            const jitter = 0.9 + Math.random() * 0.2;
            const nextRetryAt = Date.now() + Math.round(exponentialDelay * jitter);

            const stmt = this.db.prepare(`
                UPDATE print_jobs
                SET status = 'PENDING', retry_count = ?, next_retry_at = ?, error_msg = ?
                WHERE id = ?
            `);
            stmt.run(nextRetryCount, nextRetryAt, errorMsg, id);
            this.log(`Job ${id} failed (attempt ${nextRetryCount}). Retrying at ${new Date(nextRetryAt).toISOString()}`);
        }
    }

    recoverPending() {
        const stmt = this.db.prepare(`
            UPDATE print_jobs
            SET status = 'PENDING'
            WHERE status = 'PROCESSING'
        `);
        const info = stmt.run();
        if (info.changes > 0) {
            this.log(`Recovered ${info.changes} job(s) from PROCESSING back to PENDING.`);
        }
    }

    getQueueStatus() {
        const stmt = this.db.prepare(`
            SELECT 
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN status = 'FAILED_PERMANENT' THEN 1 ELSE 0 END) as failed
            FROM print_jobs
        `);
        const counts = stmt.get() || { pending: 0, processing: 0, failed: 0 };
        return {
            pending: counts.pending || 0,
            processing: counts.processing || 0,
            failed: counts.failed || 0
        };
    }
}

module.exports = PrintQueue;
