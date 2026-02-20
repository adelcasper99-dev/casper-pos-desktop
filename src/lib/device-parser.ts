/**
 * Device Parser Utility
 * Parses user agent strings to extract device type and browser info
 */

export interface DeviceInfo {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet';
  browser: string;
}

export function parseUserAgent(userAgent: string): DeviceInfo {
  if (!userAgent) {
    return { deviceType: 'Desktop', browser: 'Unknown' };
  }

  // Detect device type
  const isMobile = /Mobile|Android|iPhone/i.test(userAgent);
  const isTablet = /iPad|Tablet/i.test(userAgent);
  
  let deviceType: DeviceInfo['deviceType'] = 'Desktop';
  if (isTablet) {
    deviceType = 'Tablet';
  } else if (isMobile) {
    deviceType = 'Mobile';
  }

  // Detect browser
  let browser = 'Unknown';
  if (userAgent.includes('Edg/')) {
    browser = 'Edge';
  } else if (userAgent.includes('Chrome')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    browser = 'Opera';
  }

  return { deviceType, browser };
}

/**
 * Get client IP address from request headers
 * Checks common proxy headers before falling back to direct connection
 */
export function getClientIP(request: Request): string {
  // Check common proxy headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback to unknown
  return 'Unknown';
}
