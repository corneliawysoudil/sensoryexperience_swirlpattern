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
    // These are base colors - animations will vary from these
    stateLEDColors: {
        // Calculated from stateConfigs - will be updated dynamically
    },

    // Convert RGB (0-1) to RGBW (0-255) with NO white channel for maximum color saturation
    rgbToRGBW(r, g, b) {
        // Scale to 0-255
        let r255 = Math.round(r * 255);
        let g255 = Math.round(g * 255);
        let b255 = Math.round(b * 255);

        // Boost colors for better visibility and saturation
        // Find the maximum value to determine scaling
        const maxVal = Math.max(r255, g255, b255);
        
        // Boost dim colors more aggressively to match website appearance
        if (maxVal > 0) {
            // Boost factor: scale up to make colors more vibrant
            // For very dim colors, boost more; for bright colors, boost less
            let boostFactor = 1.0;
            if (maxVal < 30) {
                boostFactor = 100 / maxVal; // Strong boost for very dim
            } else if (maxVal < 100) {
                boostFactor = 1.5; // Moderate boost
            } else if (maxVal < 200) {
                boostFactor = 1.2; // Light boost
            }
            
            r255 = Math.min(255, Math.round(r255 * boostFactor));
            g255 = Math.min(255, Math.round(g255 * boostFactor));
            b255 = Math.min(255, Math.round(b255 * boostFactor));
        }
        
        // For RGBW strips, set white to 0 for maximum saturation
        // RGB values stay as-is (no white subtraction)
        return {
            r: Math.min(255, r255),
            g: Math.min(255, g255),
            b: Math.min(255, b255),
            w: 0  // No white channel for saturated colors
        };
    },

    // Get LED color for a state (calculated from stateConfigs)
    getStateColor(state) {
        const config = stateConfigs[state];
        if (config) {
            // Mix primary and secondary colors for better representation
            // Use 70% secondary (brighter) + 30% primary (darker) for depth
            const mixFactor = 0.7;
            const r = config.primary[0] * (1 - mixFactor) + config.secondary[0] * mixFactor;
            const g = config.primary[1] * (1 - mixFactor) + config.secondary[1] * mixFactor;
            const b = config.primary[2] * (1 - mixFactor) + config.secondary[2] * mixFactor;
            
            let rgbw = this.rgbToRGBW(r, g, b);
            
            // Special handling for standby - add very faint light (no white, just RGB)
            if (state === 'standby') {
                rgbw.r = Math.max(3, rgbw.r);
                rgbw.g = Math.max(4, rgbw.g);
                rgbw.b = Math.max(5, rgbw.b);
                rgbw.w = 0; // No white for saturation
            }
            
            // Cache it
            this.stateLEDColors[state] = rgbw;
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
    // Uses smooth but faster transitions
    async setState(state) {
        if (!this.isConnected) {
            this.currentState = state;
            return; // Silently fail if not connected
        }

        // Use smooth but faster transition (3.5 seconds)
        await this.transitionToState(state, 3500);
    },

    // Smooth transition between colors - faster than website for better responsiveness
    async transitionToState(state, duration = 3500) {
        const previousState = this.currentState;
        this.currentState = state;
        
        if (!this.isConnected) {
            return;
        }

        const targetColor = this.getStateColor(state);
        const startColor = previousState ? this.getStateColor(previousState) : { r: 0, g: 0, b: 0, w: 0 };
        
        const steps = 100; // More steps for smoother transition
        const stepDuration = duration / steps;
        let currentStep = 0;

        if (this.transitionInterval) {
            clearInterval(this.transitionInterval);
        }

        this.transitionInterval = setInterval(async () => {
            const progress = currentStep / steps;
            
            // Quintic ease-in-out matching website transitions
            const eased = progress < 0.5
                ? 16.0 * progress * progress * progress * progress * progress
                : 1.0 - Math.pow(-2.0 * progress + 2.0, 5.0) / 2.0;

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

