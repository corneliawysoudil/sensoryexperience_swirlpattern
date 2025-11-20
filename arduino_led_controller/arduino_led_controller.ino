/*
 * Arduino LED Controller - Solid Colors Per State + Side-to-Side Transition
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
 *
 * Behavior:
 *   - Each state = one solid color across the whole strip
 *   - When state changes, LEDs transition one by one from index 0 → end
 */

#include <Adafruit_NeoPixel.h>

// ---------------- CONFIG ----------------

#define LED_PIN        6       // Data pin to LED strip
#define LED_COUNT      90      // Number of LEDs
#define BRIGHTNESS     20      // Global brightness (0-255)
#define TRANSITION_DELAY 20    // ms between each LED change during transition

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

// Track current solid color actually on the strip
bool   hasCurrentColor = false;
uint8_t currR = 0, currG = 0, currB = 0, currW = 0;

// ---------------- FORWARD DECLARATIONS ----------------

void getColorForState(State s, uint8_t &r, uint8_t &g, uint8_t &b, uint8_t &w);
void applyStateColorInstant(uint8_t r, uint8_t g, uint8_t b, uint8_t w);
void transitionSideToSide(uint8_t fromR, uint8_t fromG, uint8_t fromB, uint8_t fromW,
                          uint8_t toR,   uint8_t toG,   uint8_t toB,   uint8_t toW);

// ---------------- SETUP ----------------

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  inputString.reserve(100);

  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show(); // all off

  Serial.println("LED Controller Ready (solid colors + side-to-side wipe)");
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

  // No per-frame animation. Strip is static until next command.
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
    // Real state change -> perform blocking side-to-side wipe
    transitionSideToSide(currR, currG, currB, currW,
                         targetR, targetG, targetB, targetW);
  } else {
    // Same state requested again -> just snap to its canonical color
    applyStateColorInstant(targetR, targetG, targetB, targetW);
  }

  currentState = newState;

  Serial.print("OK: state = ");
  Serial.println(stateStr);
}

// ---------------- STATE → FIXED COLOR ----------------

void getColorForState(State s, uint8_t &r, uint8_t &g, uint8_t &b, uint8_t &w) {
  switch (s) {
    case STATE_STANDBY:
      // Very faint bluish
      r = 0; g = 0; b = 5; w = 0;
      break;

    case STATE_ARRIVAL:
      // Dark blue
      r = 0; g = 0; b = 40; w = 0;
      break;

    case STATE_ALERT:
      // Strong red
      r = 255; g = 0; b = 0; w = 0;
      break;

    case STATE_ADAPTIVE:
      // Violet / purple
      r = 100; g = 0; b = 160; w = 0;
      break;

    case STATE_CONNECTION:
      // Warm yellow/orange
      r = 255; g = 160; b = 0; w = 0;
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

  uint32_t fromColor = strip.Color(fromR, fromG, fromB, fromW);
  uint32_t toColor   = strip.Color(toR,   toG,   toB,   toW);

  // Start in the "old" solid color
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, fromColor);
  }
  strip.show();

  // Wipe from left (0) to right (LED_COUNT-1)
  for (int idx = 0; idx < strip.numPixels(); idx++) {
    // Set this LED to the new color
    strip.setPixelColor(idx, toColor);
    strip.show();
    delay(TRANSITION_DELAY);
  }

  // Commit the new color as the current color
  currR = toR;
  currG = toG;
  currB = toB;
  currW = toW;
  hasCurrentColor = true;
}