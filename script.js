const stateConfigs = {
    standby: {
        primary: [0.04, 0.05, 0.08],
        secondary: [0.22, 0.3, 0.35],
        speed: 0.08,
        intensity: 0.42,
        noiseScale: 1.5,
        distortion: 1.25
    },
    arrival: {
        primary: [0.08, 0.11, 0.18],
        secondary: [0.7, 0.82, 0.92],
        speed: 0.16,
        intensity: 0.5,
        noiseScale: 1.7,
        distortion: 1.4
    },
    alert: {
        primary: [0.32, 0.05, 0.03],
        secondary: [0.95, 0.35, 0.05],
        speed: 0.5,
        intensity: 0.7,
        noiseScale: 2.1,
        distortion: 1.6
    },
    adaptive: {
        primary: [0.18, 0.11, 0.31],
        secondary: [0.65, 0.35, 0.75],
        speed: 0.25,
        intensity: 0.58,
        noiseScale: 1.2,
        distortion: 1.9
    },
    connection: {
        primary: [0.25, 0.15, 0.06],
        secondary: [0.93, 0.65, 0.22],
        speed: 0.12,
        intensity: 0.52,
        noiseScale: 1.0,
        distortion: 1.2
    }
};

const InactivityWatcher = {
    timeout: 5 * 60 * 1000,
    timer: null,
    callback: null,
    events: ['pointerdown', 'keydown', 'touchstart'],
    init(callback) {
        this.callback = callback;
        this.boundReset = () => this.reset();
        this.events.forEach(event => {
            document.addEventListener(event, this.boundReset, { passive: true });
        });
        this.reset();
    },
    reset() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            if (typeof this.callback === 'function') {
                this.callback();
            }
        }, this.timeout);
    }
};

const role = document.body?.dataset?.role || 'controller';
const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';
const stateChannel = hasBroadcastChannel ? new BroadcastChannel('exhibition-state') : null;

const safeStorage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (err) {
            console.warn('Unable to access localStorage', err);
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (err) {
            console.warn('Unable to access localStorage', err);
        }
    }
};

const SwirlBackground = (() => {
    const vertexSource = `
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    const fragmentSource = `
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform vec3 u_colorA;
        uniform vec3 u_colorB;
        uniform float u_speed;
        uniform float u_intensity;
        uniform float u_noiseScale;
        uniform float u_distortion;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p, float sharpness) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            
            // Interpolation based on sharpness: smooth for low speed, sharp for high speed
            // sharpness is normalized 0-1, where 0 = smooth curves, 1 = sharp/spikey
            float curvePower = mix(2.0, 0.3, sharpness); // 2.0 = smooth, 0.3 = sharp/spikey
            
            vec2 u;
            u.x = pow(f.x, curvePower);
            u.y = pow(f.y, curvePower);
            
            return mix(a, b, u.x) +
                   (c - a) * u.y * (1.0 - u.x) +
                   (d - b) * u.x * u.y;
        }

        float fbm(vec2 p, float sharpness) {
            float total = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 5; i++) {
                total += noise(p, sharpness) * amplitude;
                p *= 2.0;
                amplitude *= 0.5;
            }
            return total;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            vec2 centered = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

            // Normalize speed to control curve sharpness (0.08 to 0.9 range)
            float normalizedSpeed = clamp((u_speed - 0.05) / 0.85, 0.0, 1.0);
            float curveSharpness = normalizedSpeed;

            float t = u_time * u_speed;
            float flow = fbm(centered * u_noiseScale + t, curveSharpness);
            float swirl = fbm(centered * (u_noiseScale * 0.5) + vec2(flow * u_distortion), curveSharpness);

            // Make rotation angle changes more abrupt for high speed (spikey curves)
            float angleMultiplier = mix(1.0, 2.5, normalizedSpeed); // More rotation variation at high speed
            float angle = swirl * 6.2831 * angleMultiplier;
            float s = sin(angle);
            float c = cos(angle);
            vec2 rotated = mat2(c, -s, s, c) * centered;

            float layered = fbm(rotated * (u_noiseScale * 1.8) + t * 0.2, curveSharpness);
            
            // Adjust smoothstep edges based on speed: sharper transitions for high speed
            float edgeLow = mix(0.1, 0.3, normalizedSpeed);
            float edgeHigh = mix(0.9, 0.7, normalizedSpeed);
            float pattern = smoothstep(edgeLow, edgeHigh, layered * u_intensity);
            
            // Apply additional sharpening for very high speeds (spikey effect)
            float spikeFactor = clamp((normalizedSpeed - 0.7) / 0.3, 0.0, 1.0);
            pattern = mix(pattern, pow(pattern, 0.4), spikeFactor);

            vec3 color = mix(u_colorA, u_colorB, pattern);
            gl_FragColor = vec4(color, 1.0);
        }
    `;

    const lerp = (start, end, alpha) => start + (end - start) * alpha;
    const mixVec3 = (start, end, alpha) => start.map((val, i) => lerp(val, end[i], alpha));

    return {
        init(canvas) {
            this.canvas = canvas;
            this.gl = canvas.getContext('webgl', { antialias: true, powerPreference: 'high-performance' });
            if (!this.gl) {
                console.warn('WebGL not supported, swirl background disabled.');
                canvas.style.display = 'none';
                return;
            }

            this.program = this.createProgram(vertexSource, fragmentSource);
            this.gl.useProgram(this.program);

            this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
            this.buffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.bufferData(
                this.gl.ARRAY_BUFFER,
                new Float32Array([
                    -1, -1,
                    1, -1,
                    -1,  1,
                    1,  1
                ]),
                this.gl.STATIC_DRAW
            );

            this.uniforms = {
                resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
                time: this.gl.getUniformLocation(this.program, 'u_time'),
                colorA: this.gl.getUniformLocation(this.program, 'u_colorA'),
                colorB: this.gl.getUniformLocation(this.program, 'u_colorB'),
                speed: this.gl.getUniformLocation(this.program, 'u_speed'),
                intensity: this.gl.getUniformLocation(this.program, 'u_intensity'),
                noiseScale: this.gl.getUniformLocation(this.program, 'u_noiseScale'),
                distortion: this.gl.getUniformLocation(this.program, 'u_distortion')
            };

            this.currentConfig = null;
            this.targetConfig = null;
            this.startConfig = null;
            this.transitionStartTime = null;
            this.transitionDuration = 11.0; // seconds - slower, smoother transitions
            this.isReady = true;

            this.resize();
            window.addEventListener('resize', () => this.resize());

            const renderLoop = (timestamp) => {
                if (this.isReady) {
                    this.render(timestamp * 0.001);
                }
                this.animationFrame = requestAnimationFrame(renderLoop);
            };
            this.animationFrame = requestAnimationFrame(renderLoop);
        },

        createProgram(vertexSrc, fragmentSrc) {
            const gl = this.gl;
            const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSrc);
            const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSrc);

            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('Program failed to link:', gl.getProgramInfoLog(program));
                gl.deleteProgram(program);
                return null;
            }
            return program;
        },

        createShader(type, source) {
            const gl = this.gl;
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader failed to compile:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        },

        resize() {
            if (!this.gl) return;
            const displayWidth = this.canvas.clientWidth || window.innerWidth;
            const displayHeight = this.canvas.clientHeight || window.innerHeight;

            if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
                this.canvas.width = displayWidth;
                this.canvas.height = displayHeight;
                this.gl.viewport(0, 0, displayWidth, displayHeight);
            }
            this.gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        },

        cloneConfig(config) {
            return {
                primary: [...config.primary],
                secondary: [...config.secondary],
                speed: config.speed,
                intensity: config.intensity,
                noiseScale: config.noiseScale,
                distortion: config.distortion
            };
        },

        setState(config) {
            if (!config) return;
            
            // If we're already transitioning, start from current position
            if (this.currentConfig && this.targetConfig) {
                this.startConfig = this.cloneConfig(this.currentConfig);
            } else if (!this.currentConfig) {
                // First time initialization
                this.currentConfig = this.cloneConfig(config);
                this.startConfig = this.cloneConfig(config);
            } else {
                // Start from current config
                this.startConfig = this.cloneConfig(this.currentConfig);
            }
            
            this.targetConfig = this.cloneConfig(config);
            this.transitionStartTime = performance.now() * 0.001;
        },

        updateConfig(currentTime) {
            if (!this.targetConfig || !this.currentConfig || !this.startConfig || !this.transitionStartTime) return;
            
            // Calculate progress from 0 to 1
            const elapsed = currentTime - this.transitionStartTime;
            let progress = Math.min(elapsed / this.transitionDuration, 1.0);
            
            // Apply very smooth ease-in-out curve for gentle transitions
            // Quintic ease-in-out: even smoother acceleration and deceleration
            const easeInOut = progress < 0.5
                ? 16.0 * progress * progress * progress * progress * progress
                : 1.0 - Math.pow(-2.0 * progress + 2.0, 5.0) / 2.0;
            
            // Gentler easing function specifically for colors - creates smoother gradient transitions
            // Uses a smoother ease-in-out curve with more gradual acceleration/deceleration
            // This creates a more gradual gradient effect instead of sudden color changes
            const easeColor = progress < 0.5
                ? 2.0 * progress * progress * progress * progress
                : 1.0 - Math.pow(-2.0 * progress + 2.0, 4.0) / 2.0;
            
            const alpha = easeInOut;
            const colorAlpha = easeColor;

            // Interpolate from start to target
            // Use gentler easing for colors to create smooth gradient transitions
            this.currentConfig.primary = mixVec3(this.startConfig.primary, this.targetConfig.primary, colorAlpha);
            this.currentConfig.secondary = mixVec3(this.startConfig.secondary, this.targetConfig.secondary, colorAlpha);
            // Keep quintic easing for other parameters
            this.currentConfig.speed = lerp(this.startConfig.speed, this.targetConfig.speed, alpha);
            this.currentConfig.intensity = lerp(this.startConfig.intensity, this.targetConfig.intensity, alpha);
            this.currentConfig.noiseScale = lerp(this.startConfig.noiseScale, this.targetConfig.noiseScale, alpha);
            this.currentConfig.distortion = lerp(this.startConfig.distortion, this.targetConfig.distortion, alpha);
        },

        render(time) {
            if (!this.gl || !this.currentConfig) return;

            const now = performance.now() * 0.001;
            this.updateConfig(now);

            this.gl.clear(this.gl.COLOR_BUFFER_BIT);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.enableVertexAttribArray(this.positionLocation);
            this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);

            this.gl.uniform1f(this.uniforms.time, time);
            this.gl.uniform3fv(this.uniforms.colorA, new Float32Array(this.currentConfig.primary));
            this.gl.uniform3fv(this.uniforms.colorB, new Float32Array(this.currentConfig.secondary));
            this.gl.uniform1f(this.uniforms.speed, this.currentConfig.speed);
            this.gl.uniform1f(this.uniforms.intensity, this.currentConfig.intensity);
            this.gl.uniform1f(this.uniforms.noiseScale, this.currentConfig.noiseScale);
            this.gl.uniform1f(this.uniforms.distortion, this.currentConfig.distortion);

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        }
    };
})();

// State management for exhibition states
const ExhibitionState = {
    currentState: null,
    channel: stateChannel,
    role,

    init() {
        const canvas = document.getElementById('background-canvas');
        SwirlBackground.init(canvas);

        if (this.role === 'controller') {
            const buttons = document.querySelectorAll('.state-button');
            buttons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const newState = e.target.getAttribute('data-state');
                    this.changeState(newState);
                });
            });

            // LED connection button handler
            const ledConnectBtn = document.getElementById('led-connect-btn');
            if (ledConnectBtn && typeof LEDController !== 'undefined') {
                ledConnectBtn.addEventListener('click', async () => {
                    if (LEDController.isConnected) {
                        await LEDController.disconnect();
                    } else {
                        await LEDController.connect();
                    }
                });
            } else if (ledConnectBtn) {
                ledConnectBtn.disabled = true;
                ledConnectBtn.textContent = 'Unavailable';
            }
        }

        this.setupChannelSync();

        const storedState = safeStorage.get('exhibitionState');
        this.changeState(storedState || 'standby', { broadcast: false, persist: this.role === 'controller' });

        if (this.role === 'controller') {
            this.inactivityWatcher = InactivityWatcher;
            this.inactivityWatcher.init(() => {
                this.changeState('standby', { persist: true });
            });
        }
    },

    setupChannelSync() {
        if (!this.channel) {
            return;
        }

        if (this.role === 'controller') {
            this.channel.addEventListener('message', (event) => {
                if (event.data?.type === 'state-request' && this.currentState) {
                    this.channel.postMessage({ type: 'state-change', state: this.currentState });
                }
            });
        } else {
            this.channel.addEventListener('message', (event) => {
                if (event.data?.type === 'state-change') {
                    this.changeState(event.data.state, { broadcast: false, persist: false });
                }
            });
            this.channel.postMessage({ type: 'state-request' });
        }
    },

    changeState(newState, { broadcast = true, persist } = {}) {
        if (newState === this.currentState) {
            return;
        }

        if (this.currentState) {
            document.body.classList.remove(`state-${this.currentState}`);
        }
        document.body.classList.add(`state-${newState}`);

        document.querySelectorAll('.state-button').forEach(button => {
            if (button.getAttribute('data-state') === newState) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        this.currentState = newState;

        if (SwirlBackground.isReady) {
            SwirlBackground.setState(stateConfigs[newState]);
        }

        // Update LED strip when state changes
        if (typeof LEDController !== 'undefined' && LEDController.isConnected) {
            LEDController.setState(newState);
        }

        const shouldPersist = typeof persist === 'boolean' ? persist : this.role === 'controller';
        if (shouldPersist) {
            safeStorage.set('exhibitionState', newState);
        }

        if (broadcast && this.role === 'controller' && this.channel) {
            this.channel.postMessage({ type: 'state-change', state: newState });
        }

        if (this.role === 'controller' && this.inactivityWatcher) {
            this.inactivityWatcher.reset();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ExhibitionState.init();
});

