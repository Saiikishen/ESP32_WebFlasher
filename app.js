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

    // ============= Helper: Log to Terminal =============
    const log = (msg, type = 'info') => {
        const terminal = document.querySelector('.terminal-window');
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

    // ============= Helper: Update Progress Bar =============
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

    // ============= esptool-js Terminal Interface =============
    const espLoaderTerminal = {
        clean() {
            // Clear is optional
        },
        writeLine(data) {
            log(data, 'info');
        },
        write(data) {
            // For incremental output - we batch it for cleaner display
            if (data.trim()) {
                log(data.trim(), 'info');
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
                        if (line) log(line, 'data');
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

    // ============= File input handling =============
    const fileInputs = ['singleFile', 'bootloaderFile', 'partitionsFile', 'appFile'];

    fileInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                const container = input.closest('.file-selector, .file-row');
                const fileNameSpan = container.querySelector('.file-name');

                if (file) {
                    if (fileNameSpan) {
                        fileNameSpan.textContent = file.name;
                    }
                    log(`Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'success');
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
            log('Connect to a device first!', 'warning');
            return;
        }

        try {
            // Stop read loop and close port to let esptool take over
            log('Stopping serial monitor for exclusive access...', 'info');
            await stopReadingAndClose();

            log('Starting chip erase...', 'info');
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
            log(`Connected to ${esploader.chip.CHIP_NAME}`, 'success');

            updateProgress(true, 50, 'Erasing flash...');
            await esploader.eraseFlash();


            updateProgress(true, 100, 'Erase complete!');
            log('Chip erased successfully!', 'success');

            await new Promise(resolve => setTimeout(resolve, 1000));
            updateProgress(false);

            // Reset and Restart Monitor
            log('Resetting device...', 'info');
            await transport.setDTR(false);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(true);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(false);

            try { await transport.disconnect(); } catch (e) { }

            // Re-open for monitor
            await port.open({ baudRate: 115200 });
            startReading();
            log('Serial monitor active.', 'success');

        } catch (error) {
            log(`Erase error: ${error.message}`, 'error');
            console.error(error);
            updateProgress(false);

            // Try to recover monitor
            try {
                await port.open({ baudRate: 115200 });
                startReading();
            } catch (e) { }
        }
    });

    // ============= Program Button Handler =============
    document.getElementById('programBtn')?.addEventListener('click', async () => {
        if (!port) {
            log('Connect to a device first!', 'warning');
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
                    log('Please select a firmware file first!', 'warning');
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
                    log('Please select at least one file to flash!', 'warning');
                    return;
                }
            }

            // Stop monitor for flashing
            log('Stopping serial monitor for flashing...', 'info');
            await stopReadingAndClose();

            log(`Preparing to flash ${filesToFlash.length} file(s)...`, 'info');
            updateProgress(true, 0, 'Connecting to ESP32...');

            transport = new Transport(port, true);
            esploader = new ESPLoader({
                transport,
                baudrate: 115200,
                terminal: espLoaderTerminal,
                enableTracing: false
            });

            log('Connecting to ESP32 bootloader...', 'info');
            const chip = await esploader.main();
            log(`Chip detected: ${chip}`, 'success');

            // Check if stub is already running before trying to load it
            if (esploader.IS_STUB) {
                log('Stub loader already running (from previous session)', 'success');
            } else {
                // Add delay to ensure chip is fully ready
                await new Promise(resolve => setTimeout(resolve, 200));

                try {
                    log('Uploading stub loader for fast flashing...', 'info');
                    await esploader.runStub();
                    log('Stub loader running!', 'success');
                } catch (e) {
                    log(`Stub loader failed: ${e.message}`, 'warning');
                    log('Using ROM bootloader (slower)', 'warning');
                }
            }

            // Flash each file
            for (let i = 0; i < filesToFlash.length; i++) {
                const fileInfo = filesToFlash[i];
                log(`Flashing ${fileInfo.name} to 0x${fileInfo.address.toString(16).padStart(8, '0')}...`, 'info');

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
                log(`${fileInfo.name} flashed successfully!`, 'success');
            }

            updateProgress(true, 100, 'Flash complete!');
            log('All files flashed successfully!', 'success');

            await new Promise(resolve => setTimeout(resolve, 1000));
            updateProgress(false);

            // Reset via transport (esptool-js API)
            log('Resetting device...', 'info');
            await transport.setDTR(false);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(true);
            await new Promise(r => setTimeout(r, 100));
            await transport.setRTS(false);

            try { await transport.disconnect(); } catch (e) { }

            // Restart monitor
            await port.open({ baudRate: 115200 });
            startReading();
            log('Serial monitor active. Watching for boot logs...', 'success');

        } catch (error) {
            log(`Flash error: ${error.message}`, 'error');
            console.error(error);
            updateProgress(false);

            // Try to recover monitor
            try {
                await port.open({ baudRate: 115200 });
                startReading();
            } catch (e) { }
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
});
