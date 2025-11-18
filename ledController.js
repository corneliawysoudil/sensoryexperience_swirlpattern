// LED Controller for Arduino RGBW LED Strip
// Uses Web Serial API to communicate with Arduino

const LEDController = {
    port: null,
    reader: null,
    writer: null,
    isConnected: false,
    currentState: null,
    transitionInterval: null,

    // LED color mappings for each state (RGBW 0-255)
    // Colors are derived from state configs, optimized for RGBW strips
    stateLEDColors: {
        standby: { r: 2, g: 2, b: 2, w: 1 },      // Very dark, minimal white
        arrival: { r: 20, g: 45, b: 80, w: 120 },  // Cold blue-white
        alert: { r: 255, g: 69, b: 0, w: 0 },      // Sharp red-orange
        adaptive: { r: 5, g: 50, b: 100, w: 40 },  // Deep blue-teal
        connection: { r: 238, g: 166, b: 56, w: 80 } // Warm amber
    },

    // Convert RGB (0-1) to RGBW (0-255) with white channel optimization
    rgbToRGBW(r, g, b) {
        // Scale to 0-255
        const r255 = Math.round(r * 255);
        const g255 = Math.round(g * 255);
        const b255 = Math.round(b * 255);

        // Calculate white component (minimum of RGB for efficiency)
        const w = Math.min(r255, g255, b255);

        // Subtract white from RGB
        const rFinal = Math.max(0, r255 - w);
        const gFinal = Math.max(0, g255 - w);
        const bFinal = Math.max(0, b255 - w);

        return {
            r: Math.min(255, rFinal),
            g: Math.min(255, gFinal),
            b: Math.min(255, bFinal),
            w: Math.min(255, w)
        };
    },

    // Get LED color for a state (using predefined or calculated)
    getStateColor(state) {
        if (this.stateLEDColors[state]) {
            return this.stateLEDColors[state];
        }
        
        // Fallback: calculate from state config
        const config = stateConfigs[state];
        if (config) {
            // Use secondary color (brighter) for LED
            const rgbw = this.rgbToRGBW(config.secondary[0], config.secondary[1], config.secondary[2]);
            return rgbw;
        }
        
        return { r: 0, g: 0, b: 0, w: 0 };
    },

    // Send command to Arduino: "STATE,R,G,B,W\n"
    async sendCommand(state, color) {
        if (!this.isConnected || !this.writer) {
            return;
        }

        try {
            const command = `${state},${color.r},${color.g},${color.b},${color.w}\n`;
            const encoder = new TextEncoder();
            await this.writer.write(encoder.encode(command));
            console.log('LED command sent:', command.trim());
        } catch (error) {
            console.error('Error sending LED command:', error);
            this.handleDisconnect();
        }
    },

    // Connect to Arduino via Web Serial API
    async connect() {
        if (!navigator.serial) {
            alert('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
            return false;
        }

        try {
            // Request port access
            this.port = await navigator.serial.requestPort();
            
            // Open connection with baud rate 115200
            await this.port.open({ baudRate: 115200 });
            
            // Set up reader and writer
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            
            this.isConnected = true;
            this.updateConnectionUI();
            
            console.log('Connected to Arduino');
            
            // Send current state if set
            if (this.currentState) {
                const color = this.getStateColor(this.currentState);
                await this.sendCommand(this.currentState, color);
            }
            
            // Start reading responses (optional, for debugging)
            this.readSerial();
            
            return true;
        } catch (error) {
            console.error('Connection error:', error);
            if (error.name === 'NotFoundError') {
                alert('No Arduino port selected.');
            } else if (error.name === 'SecurityError') {
                alert('Serial port access denied. Please grant permission.');
            } else {
                alert('Failed to connect: ' + error.message);
            }
            this.isConnected = false;
            this.updateConnectionUI();
            return false;
        }
    },

    // Disconnect from Arduino
    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.reader.releaseLock();
                this.reader = null;
            }
            
            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            if (this.transitionInterval) {
                clearInterval(this.transitionInterval);
                this.transitionInterval = null;
            }
            
            this.isConnected = false;
            this.updateConnectionUI();
            console.log('Disconnected from Arduino');
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    },

    // Handle unexpected disconnect
    handleDisconnect() {
        this.isConnected = false;
        this.updateConnectionUI();
        if (this.transitionInterval) {
            clearInterval(this.transitionInterval);
            this.transitionInterval = null;
        }
    },

    // Read serial responses (for debugging/feedback)
    async readSerial() {
        if (!this.reader) return;
        
        try {
            while (this.isConnected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                const decoder = new TextDecoder();
                const text = decoder.decode(value);
                if (text.trim()) {
                    console.log('Arduino:', text.trim());
                }
            }
        } catch (error) {
            console.error('Serial read error:', error);
            this.handleDisconnect();
        }
    },

    // Update connection status UI
    updateConnectionUI() {
        const statusEl = document.getElementById('led-connection-status');
        const buttonEl = document.getElementById('led-connect-btn');
        
        if (statusEl) {
            statusEl.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            statusEl.className = this.isConnected ? 'led-status connected' : 'led-status disconnected';
        }
        
        if (buttonEl) {
            buttonEl.textContent = this.isConnected ? 'Disconnect LED' : 'Connect LED';
            buttonEl.disabled = false;
        }
    },

    // Set LED state (called when exhibition state changes)
    async setState(state) {
        this.currentState = state;
        
        if (!this.isConnected) {
            return; // Silently fail if not connected
        }

        const color = this.getStateColor(state);
        await this.sendCommand(state, color);
    },

    // Smooth transition between colors (optional enhancement)
    async transitionToState(state, duration = 5000) {
        this.currentState = state;
        
        if (!this.isConnected) {
            return;
        }

        const targetColor = this.getStateColor(state);
        const startColor = this.getStateColor(this.currentState) || { r: 0, g: 0, b: 0, w: 0 };
        
        const steps = 50; // Number of intermediate steps
        const stepDuration = duration / steps;
        let currentStep = 0;

        if (this.transitionInterval) {
            clearInterval(this.transitionInterval);
        }

        this.transitionInterval = setInterval(async () => {
            const progress = currentStep / steps;
            
            // Ease-in-out interpolation
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            const color = {
                r: Math.round(startColor.r + (targetColor.r - startColor.r) * eased),
                g: Math.round(startColor.g + (targetColor.g - startColor.g) * eased),
                b: Math.round(startColor.b + (targetColor.b - startColor.b) * eased),
                w: Math.round(startColor.w + (targetColor.w - startColor.w) * eased)
            };

            await this.sendCommand(state, color);

            currentStep++;
            if (currentStep > steps) {
                clearInterval(this.transitionInterval);
                this.transitionInterval = null;
                // Send final color to ensure accuracy
                await this.sendCommand(state, targetColor);
            }
        }, stepDuration);
    }
};

