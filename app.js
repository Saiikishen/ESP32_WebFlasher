/**
 * ESP32 Web Flasher - Using Official esptool-js Library
 * With Stub Loader Support for Fast Flashing
 */

// ============= Import esptool-js Library =============
import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.5.6/bundle.js';

// ============= Global State =============
let port = null;
let reader = null;
let readLoopActive = false;
let esploader = null;
let transport = null;

document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connectBtn');
    const statusText = document.getElementById('statusText');
    const connectionStatus = document.getElementById('connectionStatus');

    console.log('ESP32 Flasher Utility Initialized (with esptool-js)');

    // ============= Tab Switching Logic =============
    const switchTab = (targetId) => {
        // Update tab buttons
        document.querySelectorAll('.console-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.target === targetId);
        });
        // Update terminal windows
        document.querySelectorAll('.terminal-window').forEach(win => {
            win.classList.toggle('active', win.id === targetId);
        });
    };

    // Add click handlers for tabs
    document.querySelectorAll('.console-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.target));
    });

    // ============= Helper: Log to Terminal =============
    const log = (msg, type = 'info', targetId = 'serialConsole') => {
        const terminal = document.getElementById(targetId);
        if (!terminal) return;

        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = `> ${msg}`;

        if (type === 'success') line.style.color = 'var(--success)';
        else if (type === 'error') line.style.color = 'var(--danger)';
        else if (type === 'warning') line.style.color = 'var(--warning)';
        else if (type === 'data') line.style.color = 'var(--primary)';

        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    };

    // Convenience wrappers
    const logSerial = (msg, type = 'info') => log(msg, type, 'serialConsole');
    const logFlash = (msg, type = 'info') => log(msg, type, 'flashConsole');

    // ============= Helper: Update Progress Bar =============
    const updateProgress = (show, percent = 0, status = '') => {
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressLabel = document.getElementById('progressLabel');
        const progressPercent = document.getElementById('progressPercent');

        if (show) {
            progressContainer.style.display = 'block';
            progressBar.style.width = `${percent}%`;

            if (progressLabel) progressLabel.textContent = status;
            if (progressPercent) progressPercent.textContent = `${percent}%`;
        } else {
            progressContainer.style.display = 'none';
        }
    };

    // ============= Helper: Update Device Info =============
    const updateDeviceInfo = async (loader) => {
        const panel = document.getElementById('deviceInfoPanel');
        if (!panel) return;

        try {
            const chipName = await loader.chip.getChipDescription(loader);
            const macAddr = await loader.chip.readMac(loader);
            const features = await loader.chip.getChipFeatures(loader);
            const crystal = await loader.chip.getCrystalFreq(loader);

            document.getElementById('infoChip').textContent = chipName;
            document.getElementById('infoMac').textContent = macAddr;
            document.getElementById('infoFeat').textContent = features.join(', ');
            document.getElementById('infoCry').textContent = `${crystal} MHz`;

            panel.style.display = 'block';
        } catch (e) {
            console.error("Failed to read device info", e);
        }
    };

    // ============= esptool-js Terminal Interface =============
    const espLoaderTerminal = {
        clean() {
            // Clear is optional
        },
        writeLine(data) {
            logFlash(data, 'info');
        },
        write(data) {
            // For incremental output - we batch it for cleaner display
            if (data.trim()) {
                logFlash(data.trim(), 'info');
            }
        }
    };

    // ============= Web Serial API: Read Loop =============
    async function startReading() {
        if (!port || !port.readable) return;

        reader = port.readable.getReader();
        readLoopActive = true;
        const textDecoder = new TextDecoder();
        let buffer = '';

        try {
            while (readLoopActive) {
                const { value, done } = await reader.read();
                if (done) {
                    reader.releaseLock();
                    break;
                }
                if (value) {
                    buffer += textDecoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');

                    // Process all complete lines
                    for (let i = 0; i < lines.length - 1; i++) {
                        const line = lines[i].replace('\r', '');
                        if (line) logSerial(line, 'data');
                    }

                    // Keep the last partial line in buffer
                    buffer = lines[lines.length - 1];
                }
            }
        } catch (error) {
            if (port && port.readable) {
                console.error('Read loop error:', error);
            }
        } finally {
            if (reader) {
                try {
                    reader.releaseLock();
                } catch (e) { /* ignore */ }
                reader = null;
            }
        }
    }

    // ============= Helper: Stop Reading & Close Port =============
    async function stopReadingAndClose() {
        readLoopActive = false;

        if (reader) {
            try {
                await reader.cancel();
            } catch (e) { /* ignore */ }
            reader = null;
        }

        // Wait for read loop to fully stop
        await new Promise(resolve => setTimeout(resolve, 200));

        // Close the port to flush buffers
        if (port) {
            try {
                await port.close();
                log('Port closed for flashing', 'info');
            } catch (e) {
                console.log('Port close result:', e);
            }
        }

        // Extra delay to ensure clean state
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // ============= Web Serial API: Connect =============
    async function connectSerial() {
        if (!('serial' in navigator)) {
            log('Web Serial API not supported in this browser!', 'error');
            log('Please use Chrome or Edge.', 'warning');
            return;
        }

        try {
            // Prompt user to select a port
            port = await navigator.serial.requestPort();

            // Open the port for Serial Monitor
            await port.open({ baudRate: 115200 });

            log('Serial port connected @ 115200', 'success');

            // Update UI
            connectBtn.textContent = 'Disconnect';
            statusText.textContent = 'Connected';
            connectionStatus.classList.add('connected');

            // Start the read loop
            startReading();

        } catch (error) {
            if (error.name === 'NotFoundError') {
                log('No port selected by user.', 'warning');
            } else {
                log(`Connection error: ${error.message}`, 'error');
            }
            console.error(error);
        }
    }

    // ============= Web Serial API: Disconnect =============
    async function disconnectSerial() {
        try {
            await stopReadingAndClose();

            if (esploader) {
                // esploader usually closes transport
                esploader = null;
            }
            if (transport) {
                // transport.disconnect calls device.close()
                try { await transport.disconnect(); } catch (e) { }
                transport = null;
            }

            port = null;

            // Update UI
            connectBtn.textContent = 'Connect Device';
            statusText.textContent = 'Disconnected';
            connectionStatus.classList.remove('connected');

            log('Disconnected.', 'success');
        } catch (error) {
            log(`Disconnect error: ${error.message}`, 'error');
            console.error(error);
        }
    }

    // ============= Connect Button Handler =============
    connectBtn.addEventListener('click', async () => {
        if (port) {
            await disconnectSerial();
        } else {
            await connectSerial();
        }
    });

    // ============= File Drop Zone Handlers =============
    const fileDropZone = document.querySelector('.file-drop-zone');

    if (fileDropZone) {
        // Click to browse
        fileDropZone.addEventListener('click', () => {
            const isSingleMode = document.getElementById('singleFileContainer').style.display !== 'none';
            if (isSingleMode) {
                document.getElementById('singleFile').click();
            } else {
                // In multi mode, trigger the first file (bootloader)
                document.getElementById('bootloaderFile').click();
            }
        });

        // Drag and drop
        fileDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileDropZone.style.borderColor = 'var(--primary)';
            fileDropZone.style.backgroundColor = 'rgba(0, 242, 255, 0.05)';
        });

        fileDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileDropZone.style.borderColor = 'var(--glass-border)';
            fileDropZone.style.backgroundColor = 'transparent';
        });

        fileDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileDropZone.style.borderColor = 'var(--glass-border)';
            fileDropZone.style.backgroundColor = 'transparent';

            const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.bin'));

            if (files.length === 0) {
                logSerial('Please drop .bin files only', 'warning');
                return;
            }

            const isSingleMode = document.getElementById('singleFileContainer').style.display !== 'none';

            if (isSingleMode) {
                // Single mode: use first file
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(files[0]);
                document.getElementById('singleFile').files = dataTransfer.files;
                document.getElementById('singleFile').dispatchEvent(new Event('change', { bubbles: true }));
                logSerial(`Loaded: ${files[0].name}`, 'success');
            } else {
                // Multi mode: assign to bootloader, partitions, app
                const fileMap = {
                    0: 'bootloaderFile',
                    1: 'partitionsFile',
                    2: 'appFile'
                };

                files.slice(0, 3).forEach((file, idx) => {
                    const inputId = fileMap[idx];
                    if (inputId) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        document.getElementById(inputId).files = dataTransfer.files;
                        document.getElementById(inputId).dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });

                logSerial(`Loaded ${files.slice(0, 3).length} file(s)`, 'success');
            }
        });

        // Add cursor pointer style
        fileDropZone.style.cursor = 'pointer';
    }

    // ============= File input handling =============
    const fileInputs = ['singleFile', 'bootloaderFile', 'partitionsFile', 'appFile'];

    fileInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                const container = input.closest('.file-input-wrapper');
                const label = container ? container.querySelector('.file-label') : null;

                if (file) {
                    if (label) {
                        label.textContent = file.name;
                        label.style.color = 'var(--text-main)';
                        label.title = file.name; // Add tooltop for long names
                    }
                    log(`Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'success');
                } else {
                    if (label) {
                        label.textContent = "Choose file...";
                        label.style.color = 'var(--text-muted)';
                    }
                }
            });
        }
    });

    // ============= Flash Mode Toggling =============
    const modeSingleBtn = document.getElementById('modeSingle');
    const modeMultiBtn = document.getElementById('modeMulti');
    const singleContainer = document.getElementById('singleFileContainer');
    const multiContainer = document.getElementById('multiFileContainer');

    function setMode(mode) {
        if (mode === 'single') {
            modeSingleBtn.classList.add('active');
            modeSingleBtn.style.background = 'var(--primary)';
            modeSingleBtn.style.color = '#000';

            modeMultiBtn.classList.remove('active');
            modeMultiBtn.style.background = 'transparent';
            modeMultiBtn.style.color = 'var(--text-muted)';

            singleContainer.style.display = 'flex';
            multiContainer.style.display = 'none';
        } else {
            modeMultiBtn.classList.add('active');
            modeMultiBtn.style.background = 'var(--primary)';
            modeMultiBtn.style.color = '#000';

            modeSingleBtn.classList.remove('active');
            modeSingleBtn.style.background = 'transparent';
            modeSingleBtn.style.color = 'var(--text-muted)';

            multiContainer.style.display = 'flex';
            singleContainer.style.display = 'none';
        }
    }

    if (modeSingleBtn) modeSingleBtn.addEventListener('click', () => setMode('single'));
    if (modeMultiBtn) modeMultiBtn.addEventListener('click', () => setMode('multi'));

    // ============= Erase Button Handler =============
    document.getElementById('eraseBtn')?.addEventListener('click', async () => {
        if (!port) {
            logSerial('Connect to a device first!', 'warning');
            return;
        }

        // Switch to flash console tab
        switchTab('flashConsole');

        try {
            // Stop read loop and close port to let esptool take over
            logFlash('Stopping serial monitor for exclusive access...', 'info');
            await stopReadingAndClose();

            logFlash('Starting chip erase...', 'info');
            updateProgress(true, 0, 'Connecting to ESP32...');

            // Re-acquire transport (esptool will open the port)
            transport = new Transport(port, true);
            esploader = new ESPLoader({
                transport,
                baudrate: 115200,
                terminal: espLoaderTerminal
            });

            // Connect to the chip
            await esploader.main();
            logFlash(`Connected to ${esploader.chip.CHIP_NAME}`, 'success');

            // Populae Device Info Panel
            await updateDeviceInfo(esploader);

            updateProgress(true, 50, 'Erasing flash...');
            await esploader.eraseFlash();

            updateProgress(true, 100, 'Erase complete!');
            logFlash('Chip erased successfully!', 'success');

            await new Promise(resolve => setTimeout(resolve, 1000));
            updateProgress(false);

            // Reset and Restart Monitor
            logFlash('Resetting device...', 'info');
            await transport.setDTR(false);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(true);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(false);

            try { await transport.disconnect(); } catch (e) { }


            // Re-open for monitor
            await port.open({ baudRate: 115200 });
            startReading();
            logFlash('Erase complete! Switching to Serial Monitor...', 'success');

            // Switch back to serial console
            switchTab('serialConsole');
            logSerial('Serial monitor active.', 'success');

        } catch (error) {
            logFlash(`Erase error: ${error.message}`, 'error');
            console.error(error);
            updateProgress(false);

            // Robust recovery: clean up transport and port state
            logFlash('Attempting to recover serial connection...', 'warning');

            // Step 1: Disconnect transport if it exists
            if (transport) {
                try {
                    await transport.disconnect();
                    logFlash('Transport disconnected', 'info');
                } catch (e) {
                    console.log('Transport disconnect:', e.message);
                }
                transport = null;
            }

            // Step 2: Close port if still open
            if (port) {
                try {
                    await port.close();
                    logFlash('Port closed', 'info');
                } catch (e) {
                    console.log('Port close:', e.message);
                }
            }

            // Step 3: Wait for port to fully release
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 4: Reopen port and restart monitor
            try {
                await port.open({ baudRate: 115200 });
                startReading();
                logFlash('Serial monitor recovered!', 'success');
                switchTab('serialConsole');
                logSerial('Serial monitor active. Ready for retry.', 'success');
            } catch (reopenError) {
                logFlash(`Recovery failed: ${reopenError.message}`, 'error');
                logFlash('Please disconnect and reconnect the device.', 'warning');
            }
        }
    });

    // ============= Program Button Handler =============
    document.getElementById('programBtn')?.addEventListener('click', async () => {
        if (!port) {
            logSerial('Connect to a device first!', 'warning');
            return;
        }

        const singleFileContainer = document.getElementById('singleFileContainer');
        const multiFileContainer = document.getElementById('multiFileContainer');
        const isSingleMode = !multiFileContainer || multiFileContainer.style.display === 'none';

        try {
            const filesToFlash = [];

            if (isSingleMode) {
                const fileInput = document.getElementById('singleFile');
                const addressInput = singleFileContainer ? singleFileContainer.querySelector('.address-input') : document.querySelector('.address-input');

                if (!fileInput.files || fileInput.files.length === 0) {
                    logSerial('Please select a firmware file first!', 'warning');
                    return;
                }

                const file = fileInput.files[0];
                const address = parseInt(addressInput.value, 16);
                const data = await file.arrayBuffer(); // Get ArrayBuffer directly

                filesToFlash.push({
                    name: file.name,
                    data: data,
                    address: address
                });

            } else {
                const fileConfigs = [
                    { id: 'bootloaderFile', name: 'Bootloader' },
                    { id: 'partitionsFile', name: 'Partitions' },
                    { id: 'appFile', name: 'Firmware' }
                ];

                for (const config of fileConfigs) {
                    const fileInput = document.getElementById(config.id);
                    if (fileInput && fileInput.files && fileInput.files.length > 0) {
                        const file = fileInput.files[0];
                        const addressInput = fileInput.closest('.file-row').querySelector('.address-input');
                        const address = parseInt(addressInput.value, 16);

                        filesToFlash.push({
                            name: file.name,
                            data: await file.arrayBuffer(), // Get ArrayBuffer directly
                            address: address
                        });
                    }
                }

                if (filesToFlash.length === 0) {
                    logSerial('Please select at least one file to flash!', 'warning');
                    return;
                }
            }

            // Switch to flash console tab
            switchTab('flashConsole');

            // Stop monitor for flashing
            logFlash('Stopping serial monitor for flashing...', 'info');
            await stopReadingAndClose();

            logFlash(`Preparing to flash ${filesToFlash.length} file(s)...`, 'info');
            updateProgress(true, 0, 'Connecting to ESP32...');

            transport = new Transport(port, true);
            esploader = new ESPLoader({
                transport,
                baudrate: 115200,
                terminal: espLoaderTerminal,
                enableTracing: false
            });

            logFlash('Connecting to ESP32 bootloader...', 'info');
            const chip = await esploader.main();
            logFlash(`Chip detected: ${chip}`, 'success');

            // Populae Device Info Panel
            await updateDeviceInfo(esploader);

            // Check if stub is already running before trying to load it
            if (esploader.IS_STUB) {
                logFlash('Stub loader already running (from previous session)', 'success');
            } else {
                // Add delay to ensure chip is fully ready
                await new Promise(resolve => setTimeout(resolve, 200));

                try {
                    logFlash('Uploading stub loader for fast flashing...', 'info');
                    await esploader.runStub();
                    logFlash('Stub loader running!', 'success');
                } catch (e) {
                    logFlash(`Stub loader failed: ${e.message}`, 'warning');
                    logFlash('Using ROM bootloader (slower)', 'warning');
                }
            }

            // Flash each file
            for (let i = 0; i < filesToFlash.length; i++) {
                const fileInfo = filesToFlash[i];
                logFlash(`Flashing ${fileInfo.name} to 0x${fileInfo.address.toString(16).padStart(8, '0')}...`, 'info');

                // Convert ArrayBuffer to binary string (required for some esptool-js versions)
                const u8 = new Uint8Array(fileInfo.data);
                let binaryString = "";
                for (let j = 0; j < u8.length; j++) {
                    binaryString += String.fromCharCode(u8[j]);
                }

                const fileArray = [{
                    data: binaryString,
                    address: fileInfo.address
                }];

                updateProgress(true, 0, `Flashing ${fileInfo.name}...`);

                await esploader.writeFlash({
                    fileArray,
                    flashSize: 'keep',
                    flashMode: 'keep',
                    flashFreq: 'keep',
                    eraseAll: false,
                    compress: true,
                    reportProgress: (fileIndex, written, total) => {
                        const percent = Math.floor((written / total) * 100);
                        updateProgress(true, percent, `Flashing ${fileInfo.name}: ${percent}%`);
                    }
                });
                logFlash(`${fileInfo.name} flashed successfully!`, 'success');
            }

            updateProgress(true, 100, 'Flash complete!');
            logFlash('All files flashed successfully!', 'success');

            await new Promise(resolve => setTimeout(resolve, 1000));
            updateProgress(false);

            // Reset via transport (esptool-js API)
            logFlash('Resetting device...', 'info');
            await transport.setDTR(false);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(true);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(false);

            try { await transport.disconnect(); } catch (e) { }

            // Restart monitor
            await port.open({ baudRate: 115200 });
            startReading();
            logFlash('Flash complete! Switching to Serial Monitor...', 'success');

            // Switch back to serial console
            switchTab('serialConsole');
            logSerial('Serial monitor active. Watching for boot logs...', 'success');

        } catch (error) {
            logFlash(`Flash error: ${error.message}`, 'error');
            console.error(error);
            updateProgress(false);

            // Robust recovery: clean up transport and port state
            logFlash('Attempting to recover serial connection...', 'warning');

            // Step 1: Disconnect transport if it exists
            if (transport) {
                try {
                    await transport.disconnect();
                    logFlash('Transport disconnected', 'info');
                } catch (e) {
                    console.log('Transport disconnect:', e.message);
                }
                transport = null;
            }

            // Step 2: Close port if still open
            if (port) {
                try {
                    await port.close();
                    logFlash('Port closed', 'info');
                } catch (e) {
                    console.log('Port close:', e.message);
                }
            }

            // Step 3: Wait for port to fully release
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 4: Reopen port and restart monitor
            try {
                await port.open({ baudRate: 115200 });
                startReading();
                logFlash('Serial monitor recovered!', 'success');
                switchTab('serialConsole');
                logSerial('Serial monitor active. Ready for retry.', 'success');
            } catch (reopenError) {
                logFlash(`Recovery failed: ${reopenError.message}`, 'error');
                logFlash('Please disconnect and reconnect the device.', 'warning');
            }
        }
    });

    // ============= Serial Input Handling =============
    const sendBtn = document.getElementById('sendBtn');
    const serialInput = document.getElementById('serialInput');

    if (sendBtn && serialInput) {
        sendBtn.addEventListener('click', async () => {
            const data = serialInput.value.trim();
            if (!data) return;

            if (!port || !port.writable || port.writable.locked) {
                log('Port not available (waiting for flash to finish?)', 'warning');
                return;
            }

            try {
                const encoder = new TextEncoder();
                const writer = port.writable.getWriter();
                await writer.write(encoder.encode(data + '\n'));
                writer.releaseLock();
                log(`Sent: ${data}`, 'data'); // Use 'data' style
                serialInput.value = '';
            } catch (error) {
                log(`Send error: ${error.message}`, 'error');
            }
        });

        serialInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendBtn.click();
        });
    }

    // ============= Clear Console Button =============
    const clearConsoleBtn = document.getElementById('clearConsoleBtn');
    if (clearConsoleBtn) {
        clearConsoleBtn.addEventListener('click', () => {
            // Find the active terminal
            const activeTerminal = document.querySelector('.terminal-window.active');
            if (activeTerminal) {
                // Clear all log lines
                activeTerminal.innerHTML = '';

                // Add a cleared message
                const clearedMsg = document.createElement('div');
                clearedMsg.className = 'log-line';
                clearedMsg.textContent = '> Console cleared';
                clearedMsg.style.color = 'var(--text-muted)';
                activeTerminal.appendChild(clearedMsg);
            }
        });
    }
});
