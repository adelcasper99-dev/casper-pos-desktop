import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PrintQueue = require('../../electron/print-queue');

describe('PrintQueue', () => {
  let queue: any;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `casper_test_queue_${Math.random().toString(36).substring(7)}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    queue = new PrintQueue(tempDir);
  });

  afterEach(() => {
    if (queue && queue.db) {
      queue.db.close();
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {}
  });

  it('should initialize print_jobs table successfully', () => {
    const tableInfo = queue.db.prepare("PRAGMA table_info(print_jobs)").all();
    expect(tableInfo.some((col: any) => col.name === 'id')).toBe(true);
    expect(tableInfo.some((col: any) => col.name === 'status')).toBe(true);
  });

  it('should enqueue and dequeue jobs in FIFO order', () => {
    queue.enqueue('job-1', 'receipt', '<html>1</html>', 'Epson', 80);
    queue.enqueue('job-2', 'receipt', '<html>2</html>', 'Epson', 80);

    const jobA = queue.dequeueNext();
    expect(jobA).toBeDefined();
    expect(jobA.id).toBe('job-1');

    queue.markProcessing('job-1');
    
    const jobB = queue.dequeueNext();
    expect(jobB).toBeDefined();
    expect(jobB.id).toBe('job-2');
  });

  it('should handle completed jobs', () => {
    queue.enqueue('job-1', 'receipt', '<html>1</html>', 'Epson', 80);
    const job = queue.dequeueNext();
    queue.markProcessing(job.id);
    queue.markDone(job.id);

    const next = queue.dequeueNext();
    expect(next).toBeUndefined();

    const status = queue.getQueueStatus();
    expect(status.pending).toBe(0);
    expect(status.processing).toBe(0);
  });

  it('should implement exponential backoff on failure', () => {
    queue.enqueue('job-1', 'receipt', '<html>1</html>', 'Epson', 80);
    
    // First failure
    queue.markFailed('job-1', 'Paper jam');
    
    // It should not be immediately dequeuable since next_retry_at is in the future
    const jobImmediatelyAfter = queue.dequeueNext();
    expect(jobImmediatelyAfter).toBeUndefined();

    // Force backoff time to pass by mocking time or updating the DB
    queue.db.prepare("UPDATE print_jobs SET next_retry_at = 0 WHERE id = 'job-1'").run();

    const jobAfterBackoff = queue.dequeueNext();
    expect(jobAfterBackoff).toBeDefined();
    expect(jobAfterBackoff.id).toBe('job-1');
    expect(jobAfterBackoff.retry_count).toBe(1);
  });

  it('should permanently fail a job after max retries', () => {
    queue.enqueue('job-1', 'receipt', '<html>1</html>', 'Epson', 80);
    
    queue.markFailed('job-1', 'Error', 3); // retry 1
    queue.markFailed('job-1', 'Error', 3); // retry 2
    queue.markFailed('job-1', 'Error', 3); // retry 3 -> FAILED_PERMANENT

    const status = queue.getQueueStatus();
    expect(status.failed).toBe(1);
    expect(status.pending).toBe(0);

    const next = queue.dequeueNext();
    expect(next).toBeUndefined();
  });

  it('should recover processing jobs on start', () => {
    queue.enqueue('job-1', 'receipt', '<html>1</html>', 'Epson', 80);
    queue.markProcessing('job-1');

    // Simulate crash recovery
    queue.recoverPending();

    const status = queue.getQueueStatus();
    expect(status.pending).toBe(1);
    expect(status.processing).toBe(0);
  });
});
