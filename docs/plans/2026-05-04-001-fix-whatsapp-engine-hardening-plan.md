# Plan: WhatsApp Engine Lifecycle and Session Hardening

Hardening the native WhatsApp engine (Baileys) to resolve infinite loading states, stuck sessions, and automatic reconnection failures on Windows.

## Problem Frame
The current WhatsApp service implementation suffers from three primary failure modes:
1. **File Locking**: Windows prevents deletion of the `baileys_auth` folder while the SQLite database handles are still open, causing "Force Reset" to fail silently or partially.
2. **Infinite Initialization**: The service can hang indefinitely if `useMultiFileAuthState` or the socket connection stalls, with no mechanism to break the loop or retry.
3. **State Desync**: The UI often shows "Initializing" while the backend is either dead or disconnected, leading to user confusion.

## Proposed Changes

### Core Service logic (`electron/whatsappService.js`)

#### [MODIFY] [whatsappService.js](file:///f:/casper%20desktop/casper-pos-desktop/electron/whatsappService.js)
- Implement a state-machine based approach for `status`.
- Add a `start()` method that can be called repeatedly (idempotent initialization).
- Enhance `logout()` to be truly destructive:
    1. Unsubscribe from all socket events.
    2. Explicitly terminate the WebSocket.
    3. Nullify the socket instance.
    4. Use a retry-loop for `fs.rmSync` to handle Windows file locks (up to 3 attempts with 500ms delay).
- Add a 15-second heartbeat check: if the socket is 'READY' but hasn't responded to a ping/check, transition to 'DEGRADED'.
- Ensure `onEvent` is always called with valid payloads to keep the UI updated.

### Main Process Bridge (`electron/main.js`)

#### [MODIFY] [main.js](file:///f:/casper%20desktop/casper-pos-desktop/electron/main.js)
- Update `whatsapp:logout` to await the new hardened logout.
- Add `whatsapp:initialize` IPC handler to allow the UI to manually trigger a start/restart.
- Add better error logging for IPC failures.

### UI Integration (`src/components/settings/WhatsAppConnection.tsx`)

#### [MODIFY] [WhatsAppConnection.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/settings/WhatsAppConnection.tsx)
- Update `handleLogout` to show a "Clearing session..." loading state.
- Update `handleRefresh` to not just 'get status' but also trigger a `whatsapp:initialize` if the status is `DISCONNECTED` or `FAILED`.
- Add a "Technical Logs" collapsible to show the last 5 events from the service for better debugging.

## Implementation Units

- `[ ]` **Unit 1: Hardened Deletion Utility**
    - Create a helper in `whatsappService.js` to delete directories with retries and delay.
- `[ ]` **Unit 2: Service State Machine & Start/Stop**
    - Refactor `initialize` to be idempotent and support manual starts.
    - Implement `status` transitions: `INITIALIZING` -> `AUTHENTICATING` -> `READY`/`AWAITING_QR`/`FAILED`.
- `[ ]` **Unit 3: IPC Bridge Updates**
    - Expose `whatsapp:initialize` to the renderer.
    - Verify `whatsapp:logout` handles the full purge.
- `[ ]` **Unit 4: UI Resilience**
    - Update the settings panel to handle the new states.
    - Add user feedback for the "Force Reset" action.

## Verification Plan

### Manual Verification
1. **Normal Flow**: Pair WhatsApp, verify `READY` status, send a test message.
2. **Hard Reset**: While `READY`, click "Force Reset". Verify folder is gone, status is `DISCONNECTED`.
3. **Infinite Load Break**: Simulate a hang (manually edit code to not resolve) and verify the 15s timeout kicks in.
