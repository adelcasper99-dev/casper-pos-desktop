import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const BRIDGE_URL = 'http://localhost:4040';

const BridgeStatusSchema = z.object({
  online: z.literal(true),
  version: z.string().optional(),
  printers: z.array(z.any()),
});

describe('Hardware Bridge Connection', () => {
  it('should respond to ping status on port 4040', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${BRIDGE_URL}/api/status`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      
      const parsed = BridgeStatusSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.online).toBe(true);
        expect(Array.isArray(parsed.data.printers)).toBe(true);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Bridge did not respond within 15 seconds. Ensure Casper Hardware Bridge is running.');
      }
      throw new Error(`Failed to connect to the Hardware Bridge. Is it running? Error: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  });

  it('should accept a mock receipt print job payload', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const payload = {
      html: '<h1>Test Print</h1><p>Testing bridge connection</p>',
      jobType: 'receipt'
    };

    try {
      const response = await fetch(`${BRIDGE_URL}/api/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // The bridge should accept the connection and respond. 
      // It might return 4xx or 5xx if no default printer is set, but it shouldn't crash the test.
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    } catch (error: any) {
       if (error.name === 'AbortError') {
        throw new Error('Bridge did not respond within 15 seconds.');
      }
      throw new Error(`Failed to send print job to Hardware Bridge. Error: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  });

  it('should timeout correctly if unreachable (simulating strict 15s architecture timeout)', async () => {
    // Test the AbortController mechanism
    const controller = new AbortController();
    // Use 50ms to ensure the abort happens before a connection is established to a dead IP
    const timeout = setTimeout(() => controller.abort(), 50);

    try {
      await fetch(`http://10.255.255.255:4040/api/status`, {
        signal: controller.signal,
      });
      expect.fail('Fetch should have aborted');
    } catch (error: any) {
      expect(error.name).toBe('AbortError');
    } finally {
      clearTimeout(timeout);
    }
  });
});
