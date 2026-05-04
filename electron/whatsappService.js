const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

let _baileys = null;
async function getBaileys() {
  if (!_baileys) {
    _baileys = await import('@whiskeysockets/baileys');
  }
  return _baileys;
}

// Constants
const INTER_MSG_DELAY_MS  = 2500;   
const MAX_BURST           = 5;      
const COOLDOWN_MS         = 30000; 
const DAILY_CAP           = 200;    
const FAILURE_THRESHOLD   = 3;      
const MSG_TIMEOUT_MS      = 30000; // 🛡️ 30s timeout to prevent UI hang

// States
const WA_STATE = {
  STOPPED: 'STOPPED',
  INITIALIZING: 'INITIALIZING',
  AUTHENTICATING: 'AUTHENTICATING',
  READY: 'READY',
  AWAITING_QR: 'AWAITING_QR',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
  DISCONNECTED: 'DISCONNECTED'
};

// Internal logger proxy
let _logger = console;
function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const formatted = `[WhatsApp] [${level.toUpperCase()}] ${msg}`;
  if (_logger.info) {
    if (level === 'error') _logger.error(formatted);
    else if (level === 'warn') _logger.warn(formatted);
    else _logger.info(formatted);
  } else {
    console.log(`[${timestamp}] ${formatted}`);
  }
}

// State
let sock              = null;   
let status            = WA_STATE.STOPPED; 
let queue             = [];     
let draining          = false;
let burstCount        = 0;
let dailyCount        = 0;
let consecutiveFails  = 0;
let lastDayReset      = new Date().toDateString();
let _onEvent          = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🛡️ Hardened directory deletion for Windows compatibility.
 * Attempts to delete a directory multiple times with a delay to overcome file locks.
 */
async function forceDeleteDirectory(dir, attempts = 3, delay = 500) {
  if (!fs.existsSync(dir)) return true;
  
  for (let i = 0; i < attempts; i++) {
    try {
      log(`Attempting to delete directory (Attempt ${i + 1}/${attempts}): ${dir}`);
      fs.rmSync(dir, { recursive: true, force: true });
      log(`Successfully deleted directory: ${dir}`);
      return true;
    } catch (e) {
      log(`Delete attempt ${i + 1} failed: ${e.message}`, 'warn');
      if (i < attempts - 1) {
        log(`Waiting ${delay}ms before next attempt...`);
        await sleep(delay);
      }
    }
  }
  return false;
}

function clearAuthDir(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error('[WhatsApp] Failed to clear auth dir:', e.message);
    }
  }
}

async function initialize(onEvent, logger) {
  if (onEvent) _onEvent = onEvent;
  if (logger) _logger = logger;
  
  if (status === WA_STATE.INITIALIZING || status === WA_STATE.AUTHENTICATING) {
    log('Service is already initializing/authenticating. Skipping duplicate call.', 'warn');
    return;
  }

  log('Initializing service...');
  status = WA_STATE.INITIALIZING;
  if (_onEvent) _onEvent('status', status);
  
  // 🛡️ Safety timeout to prevent infinite loading
  const initTimeout = setTimeout(() => {
    if (status === 'AUTHENTICATING' || status === 'INITIALIZING') {
      log('Initialization timed out after 15s. Setting to DISCONNECTED.', 'error');
      status = 'DISCONNECTED';
      onEvent('status', 'DISCONNECTED');
    }
  }, 15000);

  try {
    const { 
      default: makeWASocket, 
      useMultiFileAuthState, 
      DisconnectReason, 
      fetchLatestBaileysVersion 
    } = await getBaileys();

    const authDir = path.join(app.getPath('userData'), 'baileys_auth');
    
    // Ensure parent dir exists
    if (!fs.existsSync(path.dirname(authDir))) {
      fs.mkdirSync(path.dirname(authDir), { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const setStatus = (newStatus) => {
      status = newStatus;
      if (_onEvent) _onEvent('status', newStatus);
      if (newStatus === WA_STATE.READY || newStatus === WA_STATE.AWAITING_QR) {
        clearTimeout(initTimeout);
      }
    };

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      browser: ['Casper POS', 'Desktop', '1.0.0'],
      logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        setStatus(WA_STATE.AWAITING_QR);
        if (_onEvent) _onEvent('qr', qr);
      }

      if (connection === 'connecting') {
        setStatus(WA_STATE.AUTHENTICATING);
      }

      if (connection === 'open') {
        consecutiveFails = 0;
        setStatus(WA_STATE.READY);
        startDrain();
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        log(`Connection closed (Code: ${code}, Reconnect: ${shouldReconnect})`, code === DisconnectReason.loggedOut ? 'warn' : 'info');

        if (code === DisconnectReason.loggedOut) {
          logout(); // 🛡️ Use our full logout logic
        } else if (shouldReconnect) {
          setStatus(WA_STATE.DISCONNECTED);
          queue.forEach(m => m.resolve({ success: false, error: 'CONNECTION_LOST' }));
          queue = [];
          // 🛡️ Delay re-init to prevent rapid loops
          setTimeout(() => initialize(_onEvent, _logger), 5000);
        } else {
          setStatus(WA_STATE.DISCONNECTED);
        }
      }
    });

    return sock;
  } catch (err) {
    clearTimeout(initTimeout);
    log(`FATAL INIT ERROR: ${err.message}`, 'error');
    status = WA_STATE.FAILED;
    if (_onEvent) _onEvent('status', status);
    throw err;
  }
}

async function startDrain() {
  if (draining) return;
  draining = true;
  
  while (queue.length > 0) {
    if (status !== 'READY') {
      log(`Draining paused: Status is ${status}`, 'warn');
      break;
    }
    
    if (burstCount >= MAX_BURST) {
      log('Burst cap reached, cooling down...', 'info');
      await sleep(COOLDOWN_MS);
      burstCount = 0;
    }

    const msg = queue.shift();
    // 🛡️ Check if already timed out
    if (msg.timedOut) continue;
    if (msg.timeoutTimer) clearTimeout(msg.timeoutTimer);

    try {
      log(`Sending message to ${msg.to}...`);
      await sock.sendMessage(msg.to, { text: msg.body });
      dailyCount++;
      burstCount++;
      consecutiveFails = 0;
      log(`Successfully sent message to ${msg.to}`);
      msg.resolve({ success: true });
    } catch (e) {
      consecutiveFails++;
      log(`Send failed to ${msg.to} (${consecutiveFails}/${FAILURE_THRESHOLD}): ${e.message}`, 'error');
      msg.resolve({ success: false, error: e.message });
      
      if (consecutiveFails >= FAILURE_THRESHOLD) {
        log('FAILURE THRESHOLD REACHED - DEGRADING SERVICE', 'error');
        status = WA_STATE.DEGRADED;
        if (_onEvent) _onEvent('status', status);
        break;
      }
    }
    await sleep(INTER_MSG_DELAY_MS);
  }
  draining = false;
}

function sendMessage(to, body) {
  log(`Attempting to queue message to: ${to}`);
  return new Promise((resolve) => {
    // 1. Clean and format number
    let cleanNumber = to.replace(/\D/g, '');
    if (!cleanNumber.endsWith('@s.whatsapp.net')) {
      // If it starts with 00, replace with nothing (usually international prefix)
      if (cleanNumber.startsWith('00')) cleanNumber = cleanNumber.substring(2);
      // If it's a local Egyptian number starting with 01, add 2
      if (cleanNumber.startsWith('01') && cleanNumber.length === 11) {
        cleanNumber = '2' + cleanNumber;
      }
      cleanNumber = `${cleanNumber}@s.whatsapp.net`;
    }

    if (consecutiveFails >= FAILURE_THRESHOLD) {
      log(`Send rejected: SERVICE_DEGRADED (${consecutiveFails} fails)`, 'warn');
      return resolve({ success: false, error: 'SERVICE_DEGRADED' });
    }
    if (status !== 'READY') {
      log(`Send rejected: NOT_CONNECTED (Status: ${status})`, 'warn');
      return resolve({ success: false, error: 'NOT_CONNECTED' });
    }
    
    const today = new Date().toDateString();
    if (today !== lastDayReset) {
      dailyCount = 0;
      lastDayReset = today;
    }
    
    if (dailyCount >= DAILY_CAP) {
      log('Send rejected: DAILY_CAP_EXCEEDED', 'warn');
      return resolve({ success: false, error: 'DAILY_CAP_EXCEEDED' });
    }

    const msgContext = { to: cleanNumber, body, resolve, timedOut: false };
    
    // 🛡️ Set safety timeout
    msgContext.timeoutTimer = setTimeout(() => {
      msgContext.timedOut = true;
      log(`Message to ${cleanNumber} timed out in queue`, 'warn');
      resolve({ success: false, error: 'TIMEOUT' });
    }, MSG_TIMEOUT_MS);

    log(`Message queued for: ${cleanNumber}`);
    queue.push(msgContext);
    if (!draining) startDrain();
  });
}

async function destroyClient() {
  log('Destroying client and stopping all activities...');
  draining = false;
  queue.forEach(m => m.resolve({ success: false, error: 'SHUTTING_DOWN' }));
  queue = [];
  
  if (sock) {
    try {
      // 🛡️ Critical: Remove ALL listeners to stop Baileys from auto-reconnecting during destruction
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messaging-history.set');
      
      if (sock.ws) {
        sock.ws.terminate(); // Force close websocket
      }
    } catch (e) {
      log(`Error during socket termination: ${e.message}`, 'warn');
    }
    sock = null;
  }
  status = 'DISCONNECTED';
}

async function logout() {
  log('LOGOUT INITIATED: Full session purge starting...');
  try {
    await destroyClient();
    
    // Wait a bit for file handles to release (Windows stability)
    await sleep(1000); 

    const authDir = path.join(app.getPath('userData'), 'baileys_auth');
    const deleted = await forceDeleteDirectory(authDir);
    
    if (deleted) {
      log('LOGOUT COMPLETE: Auth directory purged.');
      return { success: true };
    } else {
      log('LOGOUT PARTIAL: Failed to delete auth directory after retries.', 'error');
      return { success: false, error: 'FILE_LOCK_PERSISTS' };
    }
  } catch (err) {
    log(`LOGOUT ERROR: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

module.exports = {
  initialize,
  sendMessage,
  getStatus: () => status,
  destroyClient,
  logout,
  WA_STATE
};
