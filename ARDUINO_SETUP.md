# Arduino LED Strip Setup Guide

## Overview
This guide explains how to connect and use the RGBW LED strip with your exhibition states website.

## Hardware Requirements
- Arduino Uno (or compatible board)
- RGBW LED strip (WS2812B, SK6812, or compatible)
- USB cable to connect Arduino to computer
- Appropriate power supply for LED strip (if needed)

## Software Setup

### 1. Install Arduino IDE
1. Download and install [Arduino IDE](https://www.arduino.cc/en/software)
2. Open Arduino IDE

### 2. Install FastLED Library
1. In Arduino IDE, go to **Tools → Manage Libraries**
2. Search for "FastLED"
3. Install the **FastLED** library by Daniel Garcia

### 3. Configure Arduino Sketch
1. Open `arduino_led_controller.ino` in Arduino IDE
2. Adjust these settings in the sketch if needed:
   - `LED_PIN`: Digital pin connected to LED data line (default: 6)
   - `NUM_LEDS`: Number of LEDs in your strip (default: 60)
   - `LED_TYPE`: Your LED chipset type (WS2812B, SK6812, etc.)
   - `BRIGHTNESS`: Maximum brightness 0-255 (default: 255)

### 4. Upload Sketch to Arduino
1. Connect Arduino to your computer via USB
2. In Arduino IDE, select your board: **Tools → Board → Arduino Uno**
3. Select the port: **Tools → Port → [Your Arduino Port]**
4. Click **Upload** button (or press Ctrl+U / Cmd+U)
5. Wait for "Done uploading" message

### 5. Wire the LED Strip
- **Data line**: Connect to digital pin 6 (or your chosen pin)
- **Power (5V)**: Connect to Arduino 5V pin (for small strips) or external power supply
- **Ground**: Connect to Arduino GND pin
- **Note**: For strips with many LEDs, use an external power supply and connect grounds together

## Web Interface Setup

### 1. Browser Requirements
- **Chrome** or **Edge** (Chromium-based browsers)
- Web Serial API requires HTTPS or localhost
- If hosting locally, use `http://localhost` (works without HTTPS)

### 2. Using the LED Controller
1. Open `index.html` in your browser
2. Click the **"Connect LED"** button in the top-right corner
3. Select your Arduino port from the popup
4. Status will change to "Connected" (green)
5. Click any state button (Standby, Arrival, Alert, Adaptive, Connection)
6. The LED strip will update to match the state color

## State Color Mappings

| State | LED Color | Description |
|-------|-----------|-------------|
| **Standby** | Very dark gray | Minimal white channel |
| **Arrival** | Cold blue-white | Blue + white |
| **Alert** | Red-orange | Sharp red-orange, no white |
| **Adaptive** | Deep blue-teal | Blue + cyan tones |
| **Connection** | Warm amber | Red + green + warm white |

## Troubleshooting

### LED Strip Not Responding
- Check wiring connections
- Verify LED_PIN matches your wiring
- Check NUM_LEDS matches your strip length
- Ensure power supply is adequate

### Web Serial Connection Fails
- Make sure Arduino is connected via USB
- Close Arduino IDE Serial Monitor (only one program can use serial port)
- Try disconnecting and reconnecting
- Check browser console for error messages

### Colors Look Wrong
- Verify LED_TYPE matches your strip (WS2812B vs SK6812)
- Check COLOR_ORDER setting
- For RGBW strips, ensure you're using SK6812 RGBW type

### Serial Port Not Found
- Install Arduino USB drivers if needed
- Check Device Manager (Windows) or System Information (Mac) for port
- Try a different USB cable or port

## Command Format
The web interface sends commands in this format:
```
STATE,R,G,B,W\n
```

Example: `alert,255,69,0,0\n`

The Arduino parses this and updates all LEDs to the specified RGBW color.

## Advanced: Smooth Transitions
The LED controller includes optional smooth transition support. The Arduino sketch includes a `fadeToColor()` function that can be used for hardware-based fading if desired.

## Notes
- The Arduino sketch works independently - it listens for serial commands continuously
- You can disconnect and reconnect the web interface without restarting Arduino
- The LED strip will maintain its last color until a new command is received
- For production use, consider adding error handling and status LEDs on the Arduino

