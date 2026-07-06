import { describe, it, expect, vi } from 'vitest';

describe('Bridge Security Middleware Logic', () => {
  const mockStore = {
    get: vi.fn().mockReturnValue('super-secret-token')
  };

  const runMiddleware = (req: any, res: any, next: any) => {
    const clientIp = req.ip || req.connection?.remoteAddress || '';
    const isLocalhost = 
        clientIp === '127.0.0.1' || 
        clientIp === '::1' || 
        clientIp === '::ffff:127.0.0.1' || 
        clientIp.includes('localhost');

    if (isLocalhost) {
        return next();
    }

    const token = req.headers['x-casper-token'];
    const configuredToken = mockStore.get('securityToken');

    if (configuredToken && token === configuredToken) {
        return next();
    }

    return res.status(403).json({ error: 'Unauthorized remote bridge access' });
  };

  it('should allow localhost requests without token', () => {
    const req = { ip: '127.0.0.1', headers: {} };
    const res = {};
    const next = vi.fn();

    runMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block remote requests without token', () => {
    const req = { ip: '192.168.1.50', headers: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    runMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow remote requests with valid token', () => {
    const req = { 
      ip: '192.168.1.50', 
      headers: { 'x-casper-token': 'super-secret-token' } 
    };
    const res = {};
    const next = vi.fn();

    runMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
