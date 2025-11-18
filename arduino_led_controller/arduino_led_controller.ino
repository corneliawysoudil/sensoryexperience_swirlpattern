/*
 * Arduino LED Controller for Exhibition States
 * Controls RGBW LED strip based on serial commands from web interface
 * 
 * Command format: "STATE,R,G,B,W\n"
 * Example: "alert,255,69,0,0\n"
 * 
 * Hardware:
 * - Arduino Uno (or compatible)
 * - RGBW LED strip (WS2812B, SK6812, or compatible)
 * - LED strip connected to pin 6 (change LED_PIN if different)
 * - Number of LEDs: 60 (change NUM_LEDS to match your strip)
 * 
 * Libraries required:
 * - FastLED (install via Arduino Library Manager)
 */

#include <FastLED.h>

// Configuration - Adjust these for your setup
#define LED_PIN 6          // Digital pin connected to LED strip data line
#define NUM_LEDS 90        // Number of LEDs in your strip
#define LED_TYPE WS2812B   // LED chipset type (WS2812B, SK6812, etc.)
#define COLOR_ORDER GRB     // Color order (GRB for WS2812B, RGBW for SK6812 RGBW)
#define BRIGHTNESS 64     // Maximum brightness (0-255)

// Create LED array
CRGB leds[NUM_LEDS];

// Serial communication buffer
String inputString = "";
boolean stringComplete = false;

// Current state tracking
String currentState = "";
int currentR = 0, currentG = 0, currentB = 0, currentW = 0;

void setup() {
  // Initialize serial communication at 115200 baud
  Serial.begin(115200);
  Serial.setTimeout(50);
  
  // Reserve space for input string
  inputString.reserve(100);
  
  // Initialize FastLED
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
  
  // Set all LEDs to off initially
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
  
  // Send ready message
  Serial.println("LED Controller Ready");
  Serial.println("Waiting for commands...");
}

void loop() {
  // Check for serial input
  if (Serial.available() > 0) {
    char inChar = (char)Serial.read();
    
    // Build string until newline
    if (inChar == '\n') {
      stringComplete = true;
    } else if (inChar != '\r') {
      inputString += inChar;
    }
  }
  
  // Process complete command
  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }
}

void processCommand(String command) {
  command.trim(); // Remove whitespace
  
  if (command.length() == 0) {
    return;
  }
  
  // Parse command: "STATE,R,G,B,W"
  int firstComma = command.indexOf(',');
  if (firstComma == -1) {
    Serial.println("ERROR: Invalid command format");
    return;
  }
  
  String state = command.substring(0, firstComma);
  String colorData = command.substring(firstComma + 1);
  
  // Parse RGBW values
  int values[4];
  int index = 0;
  int lastIndex = 0;
  
  for (int i = 0; i < colorData.length() && index < 4; i++) {
    if (colorData.charAt(i) == ',' || i == colorData.length() - 1) {
      String valueStr = colorData.substring(lastIndex, i == colorData.length() - 1 ? i + 1 : i);
      values[index] = valueStr.toInt();
      index++;
      lastIndex = i + 1;
    }
  }
  
  if (index != 4) {
    Serial.println("ERROR: Invalid RGBW values");
    return;
  }
  
  // Update LED colors
  currentState = state;
  currentR = constrain(values[0], 0, 255);
  currentG = constrain(values[1], 0, 255);
  currentB = constrain(values[2], 0, 255);
  currentW = constrain(values[3], 0, 255);
  
  // Apply color to all LEDs
  updateLEDs(currentR, currentG, currentB, currentW);
  
  // Send confirmation
  Serial.print("OK: ");
  Serial.print(state);
  Serial.print(" -> R:");
  Serial.print(currentR);
  Serial.print(" G:");
  Serial.print(currentG);
  Serial.print(" B:");
  Serial.print(currentB);
  Serial.print(" W:");
  Serial.println(currentW);
}

void updateLEDs(int r, int g, int b, int w) {
  // For RGBW LEDs (like SK6812 RGBW), use CRGBW
  // For RGB LEDs (like WS2812B), ignore white channel or mix it in
  
  #ifdef LED_TYPE_SK6812
    // RGBW LED strip - use white channel
    CRGBW color = CRGBW(r, g, b, w);
    fill_solid(leds, NUM_LEDS, color);
  #else
    // RGB LED strip - mix white into RGB or ignore
    // Option 1: Add white to RGB channels
    int rFinal = constrain(r + w / 3, 0, 255);
    int gFinal = constrain(g + w / 3, 0, 255);
    int bFinal = constrain(b + w / 3, 0, 255);
    
    CRGB color = CRGB(rFinal, gFinal, bFinal);
    fill_solid(leds, NUM_LEDS, color);
  #endif
  
  FastLED.show();
}

// Optional: Add fade transition function
void fadeToColor(int targetR, int targetG, int targetB, int targetW, int steps, int delayMs) {
  int startR = currentR;
  int startG = currentG;
  int startB = currentB;
  int startW = currentW;
  
  for (int i = 0; i <= steps; i++) {
    float progress = (float)i / steps;
    
    // Ease-in-out curve
    float eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - pow(-2 * progress + 2, 2) / 2;
    
    int r = startR + (targetR - startR) * eased;
    int g = startG + (targetG - startG) * eased;
    int b = startB + (targetB - startB) * eased;
    int w = startW + (targetW - startW) * eased;
    
    updateLEDs(r, g, b, w);
    delay(delayMs);
  }
}

