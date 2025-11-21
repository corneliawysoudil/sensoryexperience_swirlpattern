/*
 * Arduino LED Controller - Solid Colors Per State
 * + Side-to-Side Transition (once per state change)
 * + Per-state Pulsing (brightness only)
 *
 * Command format from web (unchanged):
 *   "STATE,R,G,B,W\n"
 * Examples:
 *   "standby,0,0,0,0"
 *   "arrival,0,0,0,0"
 *   "alert,0,0,0,0"
 *   "adaptive,0,0,0,0"
 *   "connection,0,0,0,0"
 *
 * Only STATE is used. R,G,B,W are ignored.
 */

#include <Adafruit_NeoPixel.h>

// ---------------- CONFIG ----------------

#define LED_PIN        6       // Data pin to LED strip
#define LED_COUNT      90      // Number of LEDs
#define BRIGHTNESS     20      // Global brightness (0-255)
#define TRANSITION_DELAY 20    // ms between each LED change during transition

const float PI_F = 3.14159265f;

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRBW + NEO_KHZ800);

// Serial parsing
String inputString = "";
bool stringComplete = false;

// Simple state enum
enum State {
  STATE_NONE,
  STATE_STANDBY,
  STATE_ARRIVAL,
  STATE_ALERT,
  STATE_ADAPTIVE,
  STATE_CONNECTION
};

State currentState = STATE_NONE;

// Track current "base" color for the active state
bool   hasCurrentColor = false;
uint8_t currR = 0, currG = 0, currB = 0, currW = 0;

// Pulse timing
unsigned long lastPulseUpdate = 0;

// Transition flag so pulse doesn't fight with wipe
bool inTransition = false;

// ---------------- FORWARD DECLARATIONS ----------------

void getColorForState(State s, uint8_t &r, uint8_t &g, uint8_t &b, uint8_t &w);
void applyStateColorInstant(uint8_t r, uint8_t g, uint8_t b, uint8_t w);
void transitionSideToSide(uint8_t fromR, uint8_t fromG, uint8_t fromB, uint8_t fromW,
                          uint8_t toR,   uint8_t toG,   uint8_t toB,   uint8_t toW);
void updatePulse();

// ---------------- SETUP ----------------

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  inputString.reserve(100);

  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show(); // all off

  Serial.println("LED Controller Ready (solid colors + single wipe + pulsing)");
  Serial.println("Waiting for commands: STATE,R,G,B,W");
}

// ---------------- LOOP ----------------

void loop() {
  // Read serial into a line
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      stringComplete = true;
      break;
    } else if (c != '\r') {
      inputString += c;
    }
  }

  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }

  // Per-state pulsing (non-blocking)
  updatePulse();
}

// ---------------- COMMAND HANDLING ----------------

void processCommand(String command) {
  command.trim();
  if (command.length() == 0) return;

  int firstComma = command.indexOf(',');
  if (firstComma == -1) {
    Serial.println("ERROR: Invalid format (no comma)");
    return;
  }

  String stateStr = command.substring(0, firstComma);
  stateStr.trim();
  stateStr.toLowerCase();

  // Map text to enum
  State newState = STATE_NONE;
  if (stateStr == "standby") {
    newState = STATE_STANDBY;
  } else if (stateStr == "arrival") {
    newState = STATE_ARRIVAL;
  } else if (stateStr == "alert") {
    newState = STATE_ALERT;
  } else if (stateStr == "adaptive") {
    newState = STATE_ADAPTIVE;
  } else if (stateStr == "connection") {
    newState = STATE_CONNECTION;
  } else {
    newState = STATE_NONE;
  }

  // Determine the target solid color for this state
  uint8_t targetR, targetG, targetB, targetW;
  getColorForState(newState, targetR, targetG, targetB, targetW);

  if (!hasCurrentColor || newState == STATE_NONE) {
    // First time, or going to "none" -> just snap
    applyStateColorInstant(targetR, targetG, targetB, targetW);
  } else if (newState != currentState) {
    // Real state change -> perform blocking side-to-side wipe ONCE
    transitionSideToSide(currR, currG, currB, currW,
                         targetR, targetG, targetB, targetW);
  } else {
    // Same state again -> ignore, no extra wipe, no snap
    // This avoids double transitions when the website sends duplicates.
  }

  currentState = newState;

  Serial.print("OK: state = ");
  Serial.println(stateStr);
}

// ---------------- STATE → FIXED BASE COLOR ----------------

void getColorForState(State s, uint8_t &r, uint8_t &g, uint8_t &b, uint8_t &w) {
  switch (s) {
    case STATE_STANDBY:
      // Soft white-blue, dim
      r = 4;  g = 8;  b = 20; w = 5;   // tiny bit of white to soften the blue
      break;

    case STATE_ARRIVAL:
      // Dark blue
      r = 0; g = 0; b = 50; w = 0;
      break;

    case STATE_ALERT:
      // Strong red
      r = 255; g = 0; b = 0; w = 0;
      break;

    case STATE_ADAPTIVE:
      // Violet / purple
      r = 120; g = 0; b = 190; w = 0;
      break;

    case STATE_CONNECTION:
      // Warm sun yellow / orange
      r = 255; g = 130; b = 0; w = 0;
      break;

    case STATE_NONE:
    default:
      // Off
      r = g = b = w = 0;
      break;
  }
}

// ---------------- COLOR APPLICATION ----------------

// Instantly fill the whole strip with a solid color
void applyStateColorInstant(uint8_t r, uint8_t g, uint8_t b, uint8_t w) {
  currR = r;
  currG = g;
  currB = b;
  currW = w;
  hasCurrentColor = true;

  uint32_t color = strip.Color(r, g, b, w);
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, color);
  }
  strip.show();
}

// Blocking left-to-right transition from old color to new color
void transitionSideToSide(uint8_t fromR, uint8_t fromG, uint8_t fromB, uint8_t fromW,
                          uint8_t toR,   uint8_t toG,   uint8_t toB,   uint8_t toW) {

  inTransition = true; // suspend pulsing

  uint32_t fromColor = strip.Color(fromR, fromG, fromB, fromW);
  uint32_t toColor   = strip.Color(toR,   toG,   toB,   toW);

  // Start in the "old" solid color (should already be like this, but makes it explicit)
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, fromColor);
  }
  strip.show();

  // Wipe from left (0) to right (LED_COUNT-1) exactly once
  for (int idx = 0; idx < strip.numPixels(); idx++) {
    strip.setPixelColor(idx, toColor);
    strip.show();
    delay(TRANSITION_DELAY);
  }

  // Commit the new base color
  currR = toR;
  currG = toG;
  currB = toB;
  currW = toW;
  hasCurrentColor = true;

  inTransition = false; // resume pulsing
}

// ---------------- PULSING (BRIGHTNESS ONLY) ----------------

// Global pulse: same hue, whole strip, per-state speed & depth
void updatePulse() {
  if (!hasCurrentColor) return;
  if (currentState == STATE_NONE) return;
  if (inTransition) return;  // don't fight the wipe

  // Standby should stay static: don't pulse, don't touch it
  if (currentState == STATE_STANDBY) {
    return;
  }

  unsigned long now = millis();
  if (now - lastPulseUpdate < 20) return;  // ~50 FPS max
  lastPulseUpdate = now;

  // Default pulse parameters
  unsigned long periodMs = 4000;   // full cycle duration
  float minFactor = 0.4f;          // min brightness relative to base
  float maxFactor = 1.0f;          // max brightness relative to base

  // Tune per state
  switch (currentState) {
    case STATE_ARRIVAL:
      // Calm, slower breathing
      periodMs  = 6000;
      minFactor = 0.3f;
      maxFactor = 0.9f;
      break;

    case STATE_ALERT:
      // Faster, stronger pulse (but not a full strobe)
      periodMs  = 1200;
      minFactor = 0.2f;
      maxFactor = 1.0f;
      break;

    case STATE_ADAPTIVE:
      // Medium pulse, a bit deeper
      periodMs  = 5000;
      minFactor = 0.25f;
      maxFactor = 0.95f;
      break;

    case STATE_CONNECTION:
      // Warm, gentle breathing
      periodMs  = 7000;
      minFactor = 0.3f;
      maxFactor = 1.0f;
      break;

    case STATE_STANDBY:
    case STATE_NONE:
    default:
      return; // already handled standby above
  }

  if (periodMs == 0) return;

  float phase = (now % periodMs) / (float)periodMs;          // 0..1
  float wave  = (sinf(2.0f * PI_F * phase) + 1.0f) * 0.5f;   // 0..1
  float factor = minFactor + (maxFactor - minFactor) * wave; // min..max

  // Apply brightness factor to the base color
  uint8_t r = (uint8_t)(currR * factor);
  uint8_t g = (uint8_t)(currG * factor);
  uint8_t b = (uint8_t)(currB * factor);
  uint8_t w = (uint8_t)(currW * factor);

  uint32_t color = strip.Color(r, g, b, w);
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, color);
  }
  strip.show();
}