document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const pType = document.getElementById('printerType');
    const rPrint = document.getElementById('receiptPrinter');
    const bPrint = document.getElementById('barcodePrinter');
    const aPrint = document.getElementById('a4Printer');
    const mTop = document.getElementById('marginTop');
    const mTopVal = document.getElementById('marginTopVal');
    const mLeft = document.getElementById('marginLeft');
    const mLeftVal = document.getElementById('marginLeftVal');
    
    const btnSave = document.getElementById('btnSave');
    const btnTest = document.getElementById('btnTest');
    const btnClose = document.getElementById('btnClose');
    const statusText = document.getElementById('statusText');

    let osPrinters = [];

    async function loadPrinters(retryCount = 0) {
        try {
            osPrinters = await window.electronAPI.getPrinters();
            
            // If empty and first try, wait a bit and retry (Chromium session warm-up)
            if (osPrinters.length === 0 && retryCount < 3) {
                console.log(`No printers found, retry ${retryCount + 1}/3 in 1s...`);
                setTimeout(() => loadPrinters(retryCount + 1), 1000);
                return;
            }

            const selects = [rPrint, bPrint, aPrint];
            selects.forEach(sel => {
                const currentVal = sel.value;
                sel.innerHTML = '<option value="auto">Auto (Default)</option>';
                osPrinters.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name + (p.isDefault ? ' (Default)' : '');
                    sel.appendChild(opt);
                });
                if (currentVal && currentVal !== 'auto') sel.value = currentVal;
            });
            console.log(`UI Hydrated with ${osPrinters.length} printers`);
        } catch (err) {
            console.error("Failed to fetch OS printers", err);
        }
    }

    btnClose.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });

    function showStatus(msg, isError = false) {
        statusText.textContent = msg;
        statusText.className = isError ? 'show error' : 'show success';
        setTimeout(() => { statusText.className = ''; }, 3000);
    }

    mTop.addEventListener('input', (e) => mTopVal.textContent = e.target.value);
    mLeft.addEventListener('input', (e) => mLeftVal.textContent = e.target.value);

    // Initial Load
    await loadPrinters();

    try {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
            if (settings.printerType) pType.value = settings.printerType;
            if (settings.receiptPrinter) rPrint.value = settings.receiptPrinter;
            if (settings.barcodePrinter) bPrint.value = settings.barcodePrinter;
            if (settings.a4Printer) aPrint.value = settings.a4Printer;
            
            mTop.value = settings.marginTop || 0;
            mTopVal.textContent = mTop.value;
            mLeft.value = settings.marginLeft || 0;
            mLeftVal.textContent = mLeft.value;
        }
    } catch (err) {
        console.error("Failed to load settings from main process", err);
    }

    btnSave.addEventListener('click', async () => {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';
        
        try {
            await window.electronAPI.saveSettings({
                printerType: pType.value,
                receiptPrinter: rPrint.value,
                barcodePrinter: bPrint.value,
                a4Printer: aPrint.value,
                marginTop: parseInt(mTop.value, 10),
                marginLeft: parseInt(mLeft.value, 10)
            });
            showStatus('Settings saved successfully');
        } catch (err) {
            showStatus('Failed to save settings', true);
        } finally {
            btnSave.disabled = false;
            btnSave.textContent = 'Save Changes';
        }
    });

    btnTest.addEventListener('click', async () => {
        btnTest.disabled = true;
        btnTest.textContent = 'Printing...';

        try {
            await window.electronAPI.saveSettings({
                printerType: pType.value,
                receiptPrinter: rPrint.value,
                barcodePrinter: bPrint.value,
                a4Printer: aPrint.value,
                marginTop: parseInt(mTop.value, 10),
                marginLeft: parseInt(mLeft.value, 10)
            });

            const res = await window.electronAPI.testPrint();
            if (res.success) {
                showStatus('Test print sent!');
            } else {
                showStatus('Print Error: ' + (res.error || 'Check connection'), true);
            }
        } catch (err) {
            showStatus('IPC Error', true);
        } finally {
            btnTest.disabled = false;
            btnTest.textContent = 'Test Alignment';
        }
    });

    // Active Clients Polling logic
    const noClientsText = document.getElementById('noClientsText');
    const clientsTable = document.getElementById('clientsTable');
    const clientsList = document.getElementById('clientsList');

    function cleanUserAgent(ua) {
        if (!ua) return 'Unknown Browser';
        if (ua.includes('iPad')) return 'iPad';
        if (ua.includes('iPhone')) return 'iPhone';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('Chrome')) return 'Chrome (PC)';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari (Mac/iOS)';
        if (ua.includes('Firefox')) return 'Firefox';
        return 'Web Browser';
    }

    async function updateActiveClientsList() {
        try {
            const clients = await window.electronAPI.getActiveClients();
            if (!clients || clients.length === 0) {
                noClientsText.style.display = 'block';
                clientsTable.style.display = 'none';
                return;
            }

            noClientsText.style.display = 'none';
            clientsTable.style.display = 'table';
            clientsList.innerHTML = '';

            clients.forEach(c => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border)';
                
                const tdIp = document.createElement('td');
                tdIp.style.padding = '8px 4px';
                tdIp.style.fontWeight = 'bold';
                tdIp.style.color = 'var(--textPrimary)';
                tdIp.textContent = c.ip;
                
                const tdBrowser = document.createElement('td');
                tdBrowser.style.padding = '8px 4px';
                tdBrowser.style.color = 'var(--textSecondary)';
                tdBrowser.textContent = cleanUserAgent(c.userAgent);
                
                const tdPing = document.createElement('td');
                tdPing.style.padding = '8px 4px';
                tdPing.style.textAlign = 'right';
                tdPing.style.color = 'var(--primary)';
                tdPing.style.fontWeight = 'bold';
                
                // Format last active relative time in seconds
                const diffSec = Math.max(0, Math.floor((Date.now() - c.lastActive) / 1000));
                tdPing.textContent = diffSec === 0 ? 'Just now' : `${diffSec}s ago`;

                tr.appendChild(tdIp);
                tr.appendChild(tdBrowser);
                tr.appendChild(tdPing);
                clientsList.appendChild(tr);
            });
        } catch (err) {
            console.error('Failed to update active clients list:', err);
        }
    }

    // Update immediately and then poll every 2 seconds
    updateActiveClientsList();
    setInterval(updateActiveClientsList, 2000);
});
