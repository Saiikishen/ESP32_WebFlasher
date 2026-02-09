# ESP32 Web Flasher

A premium, browser-based ESP32 flashing tool built with **Web Serial API** and **esptool-js**. This application allows users to flash firmware directly from Chrome/Edge without installing any drivers or command-line tools.

## 🚀 Features

### Core Functionality
- **Web Serial API Integration**: Connects directly to ESP32 devices via USB.
- **Fast Flashing**: Uses the ESP32 Stub Loader for high-speed uploads.
- **Dual Flashing Modes**:
  - **Single File**: Drag-and-drop a merged binary (e.g., from Arduino IDE/PlatformIO).
  - **Multi-File**: Flash specific parts like Bootloader, Partition Table, and App Firmware to custom addresses.
- **Robust Error Recovery**: Automatically handles transport disconnects and port resets on failure.

### Smart UI/UX
- **Glassmorphism Design**: Modern, clean interface with transparency and blur effects.
- **Landscape Layout**: Optimized for desktop with a full-width console at the bottom.
- **Tabbed Console**:
  - **Serial Monitor**: View live boot logs and debug output.
  - **Flashing Logs**: Dedicated tab for upload progress and technical details.
- **Device Info Panel**: Auto-detects and displays Chip Model, MAC Address, Features, and Crystal Frequency.
- **Interactive File Drop Zone**: Click-to-browse or drag-and-drop support for `.bin` files.

## 🛠️ Tech Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+ modules).
- **Build Tool**: Vite (fast development/bundling).
- **Library**: `esptool-js` (official Espressif JS port).
- **Communication**: Web Serial API.

## 📦 Usage

### Online (Vercel)
1. Go to the live deployment: **[esp-32-web-flasher.vercel.app](https://esp-32-web-flasher.vercel.app/)**
2. Click **Connect Device** and select your ESP32 COM port.
3. Drop your firmware file(s) into the dash-bordered box.
4. Click **Program** to start flashing.

### Local Development
1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd esp32-web-flasher
   ```
2. Install dependencies (optional, primarily for Vite):
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in Chrome or Edge.

## ⚠️ Requirements
- **Browser**: Google Chrome 89+ or Microsoft Edge 89+ (Web Serial API support required).
- **Driver**: CP210x or CH340 drivers installed on your OS (usually auto-installed on modern Windows/Mac).
- **Device**: Any ESP32-series chip (ESP32, S2, S3, C3, etc.).

## 🔧 Troubleshooting
- **"Port usage error"**: Disconnect and reconnect the USB cable, or hit the **Clear** button in the console.
- **"Failed to connect"**: Hold the **BOOT** button on your ESP32 while clicking Connect/Program.
- **Garbage output**: Ensure your device uses `115200` baud rate (default).

## 📄 License
MIT License. Free to use and modify.
