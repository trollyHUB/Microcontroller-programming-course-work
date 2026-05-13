# Вариант 03 — DHT11 вместо BME280 (без давления)

**Датчики:** DHT11 (T/H), BH1750, PIR, KY-037  
**Управление:** LCD 1602, RGB LED, Зуммер, 2 кнопки  
**Без:** BME280 (нет давления), ZM106-VOC, MQ-135  

> Используй когда нет BME280. DHT11 даёт только температуру и влажность, без давления.  
> Точность меньше (±2°C, ±5%), но для базового мониторинга достаточно.

**Библиотеки:** Wire, WiFi, HTTPClient, ArduinoJson, DHT, BH1750, LiquidCrystal_I2C

---

```cpp
/*
 * NEXIS Wellness Station — Вариант 03
 * DHT11 (T/H) + BH1750 + PIR + KY-037
 * Без BME280 (нет давления), без CO2 датчиков
 * Arduino IDE — всё в одном файле
 *
 * ← ИЗМЕНИТЬ: Введи свои данные ↓
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>

// ============================================================
//  НАСТРОЙКИ — ИЗМЕНИТЬ!
// ============================================================
#define WIFI_SSID       "Testardu"       // ← ИЗМЕНИТЬ
#define WIFI_PASSWORD   "12345678"       // ← ИЗМЕНИТЬ
#define SERVER_HOST     "10.78.242.107"  // ← ИЗМЕНИТЬ
#define SERVER_PORT     5000

// ============================================================
//  ПИНЫ
// ============================================================
#define I2C_SDA         21
#define I2C_SCL         22
#define I2C_BH1750_ADDR 0x23
#define I2C_LCD_ADDR    0x27
#define PIN_DHT         4    // DHT11 Data
#define PIN_PIR         27
#define PIN_NOISE       39
#define PIN_LED_R       13
#define PIN_LED_G       12
#define PIN_LED_B       14
#define PIN_BUZZER      25
#define PIN_BTN_MODE    32
#define PIN_BTN_OK      33

// ============================================================
//  ИНТЕРВАЛЫ
// ============================================================
#define SENSOR_INTERVAL_MS   10000   // DHT11: минимум 2 сек, ставим 10
#define DISPLAY_INTERVAL_MS  3000
#define WIFI_RECONNECT_MS    15000

// ============================================================
//  ПОРОГИ
// ============================================================
#define THRESH_TEMP_WARN    27.0f
#define THRESH_TEMP_DANGER  30.0f
#define THRESH_HUM_WARN     65.0f
#define THRESH_HUM_DANGER   75.0f
#define THRESH_LIGHT_WARN   150
#define THRESH_LIGHT_DANGER 50
#define THRESH_NOISE_WARN   55
#define THRESH_NOISE_DANGER 70
#define NOISE_DB_MIN        30.0f
#define NOISE_DB_MAX        90.0f
#define POMO_WORK_MIN       25
#define POMO_BREAK_MIN      5

// ============================================================
//  ОБЪЕКТЫ
// ============================================================
DHT               dht(PIN_DHT, DHT11);
BH1750            lightMeter;
LiquidCrystal_I2C lcd(I2C_LCD_ADDR, 16, 2);

String API_DATA_URL = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/data";
String API_POMO_URL = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/pomodoro";

// ============================================================
//  ДАННЫЕ (нет pressure, нет co2)
// ============================================================
float sensorTemp   = NAN;
float sensorHum    = NAN;
float sensorLight  = NAN;
float sensorNoise  = NAN;
bool  sensorMotion = false;

// ============================================================
//  СОСТОЯНИЕ
// ============================================================
enum AlertLevel { ALERT_OK, ALERT_WARN, ALERT_DANGER };
AlertLevel alertLevel = ALERT_OK;
String alertMessage   = "";
bool wifiConnected    = false;

enum PomoMode { POMO_IDLE, POMO_WORK, POMO_BREAK };
PomoMode pomoMode = POMO_IDLE;
uint32_t pomoStartTime = 0;
int pomoSecondsLeft = 0;
int pomoCycles = 0;

uint8_t displayPage = 0;
const uint8_t DISPLAY_PAGES = 4;  // Меньше страниц — нет давления, нет CO2

uint32_t lastSensorRead = 0;
uint32_t lastDisplayChange = 0;
uint32_t lastWifiCheck = 0;

// ============================================================
//  ISR
// ============================================================
volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;
volatile bool isrPIR     = false;

void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }
void IRAM_ATTR onPIR()     { isrPIR     = true; }

// ============================================================
//  LED / BUZZER
// ============================================================
void setLED(uint8_t r, uint8_t g, uint8_t b) { analogWrite(PIN_LED_R, r); analogWrite(PIN_LED_G, g); analogWrite(PIN_LED_B, b); }

void updateLED() {
  if (!wifiConnected) { bool blink = (millis() / 500) % 2; setLED(0, 0, blink ? 200 : 0); return; }
  if (pomoMode == POMO_BREAK) { setLED(0, 0, 100); return; }
  if (pomoMode == POMO_WORK)  { setLED(0, 150, 50); return; }
  switch (alertLevel) {
    case ALERT_OK:     setLED(0, 200, 0);   break;
    case ALERT_WARN:   setLED(200, 150, 0); break;
    case ALERT_DANGER: setLED(255, 0, 0);   break;
  }
}

void beep(int freq, int ms) { tone(PIN_BUZZER, freq, ms); }
void beepOK()     { beep(1000, 100); }
void beepWarn()   { for (int i = 0; i < 3; i++) { beep(800, 150); delay(200); } }
void beepDanger() { for (int i = 0; i < 5; i++) { beep(500, 100); delay(150); } }
void beepPomoDone() { int m[] = {1047, 1175, 1319, 1397}; for (int n : m) { beep(n, 200); delay(220); } }

// ============================================================
//  LCD — 4 страницы
// ============================================================
void lcdPrint(const char *l1, const char *l2) { lcd.clear(); lcd.setCursor(0,0); lcd.print(l1); lcd.setCursor(0,1); lcd.print(l2); }

void lcdRow(uint8_t row, const char *fmt, ...) {
  char buf[17] = {}; va_list a; va_start(a, fmt); vsnprintf(buf, 17, fmt, a); va_end(a);
  for (int i = strlen(buf); i < 16; i++) buf[i] = ' ';
  lcd.setCursor(0, row); lcd.print(buf);
}

void updateDisplay() {
  switch (displayPage) {
    case 0:  // DHT11 T/H
      if (!isnan(sensorTemp)) {
        lcdRow(0, "Temp(DHT):%4.1f C", sensorTemp);
        lcdRow(1, "Hum: %5.1f %%     ", sensorHum);
      } else {
        lcdPrint("DHT11 ERROR     ", "Check GPIO4     ");
      }
      break;

    case 1:  // Освещённость + Шум
      if (!isnan(sensorLight)) lcdRow(0, "Light:%6.0f lux", sensorLight);
      else lcdRow(0, "Light:  N/A     ");
      if (!isnan(sensorNoise)) lcdRow(1, "Noise: %5.1f dB ", sensorNoise);
      else lcdRow(1, "Noise:  N/A     ");
      break;

    case 2:  // Движение + WiFi
      lcdRow(0, "Motion: %s", sensorMotion ? "YES ! ! !" : "No       ");
      lcdRow(1, "WiFi: %s", wifiConnected ? "Connected" : "NO CONN  ");
      break;

    case 3:  // Pomodoro
      if (pomoMode == POMO_IDLE) lcdPrint("Pomodoro: IDLE  ", "OK - to start   ");
      else {
        lcdRow(0, "Pomo [%s] #%d  ", pomoMode == POMO_WORK ? "WORK" : "REST", pomoCycles + 1);
        lcdRow(1, "Time: %02d:%02d     ", pomoSecondsLeft / 60, pomoSecondsLeft % 60);
      }
      break;
  }
}

// ============================================================
//  ДАТЧИКИ
// ============================================================
void readDHT11() {
  // DHT11 нестабилен при опросе чаще 2 сек
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && t > -10 && t < 60) sensorTemp = t;
  if (!isnan(h) && h >= 0 && h <= 100) sensorHum = h;
}

void readBH1750() { float l = lightMeter.readLightLevel(); if (l >= 0) sensorLight = l; }

void readNoise() {
  int peak = 0;
  for (int i = 0; i < 20; i++) { int v = analogRead(PIN_NOISE); if (v > peak) peak = v; delay(2); }
  sensorNoise = NOISE_DB_MIN + (peak / 4095.0f) * (NOISE_DB_MAX - NOISE_DB_MIN);
}

void readPIR() {
  if (isrPIR) { sensorMotion = true; isrPIR = false; }
  else         sensorMotion = (digitalRead(PIN_PIR) == HIGH);
}

// ============================================================
//  ПОРОГИ (без CO2, без давления)
// ============================================================
AlertLevel checkThresholds() {
  AlertLevel lvl = ALERT_OK; alertMessage = "";
  auto set = [&](AlertLevel nl, const char* m) { if (nl > lvl) { lvl = nl; alertMessage = m; } else if (nl == ALERT_WARN && alertMessage.isEmpty()) alertMessage = m; };
  if (!isnan(sensorTemp)) {
    if (sensorTemp > THRESH_TEMP_DANGER) set(ALERT_DANGER, "TEMP TOO HIGH!");
    else if (sensorTemp > THRESH_TEMP_WARN) set(ALERT_WARN, "Temp elevated");
  }
  if (!isnan(sensorHum)) {
    if (sensorHum > THRESH_HUM_DANGER) set(ALERT_DANGER, "HUMIDITY HIGH!");
    else if (sensorHum > THRESH_HUM_WARN) set(ALERT_WARN, "Humidity high");
  }
  if (!isnan(sensorLight) && sensorLight > 0) {
    if (sensorLight < THRESH_LIGHT_DANGER) set(ALERT_DANGER, "LIGHT TOO LOW!");
    else if (sensorLight < THRESH_LIGHT_WARN) set(ALERT_WARN, "Light low");
  }
  if (!isnan(sensorNoise)) {
    if (sensorNoise > THRESH_NOISE_DANGER) set(ALERT_DANGER, "NOISE TOO HIGH!");
    else if (sensorNoise > THRESH_NOISE_WARN) set(ALERT_WARN, "Noise elevated");
  }
  return lvl;
}

// ============================================================
//  HTTP (без pressure и co2)
// ============================================================
bool postSensorData() {
  if (!wifiConnected) return false;
  HTTPClient http; http.begin(API_DATA_URL); http.addHeader("Content-Type", "application/json"); http.setTimeout(5000);
  JsonDocument doc;
  if (!isnan(sensorTemp))  doc["temperature"] = round(sensorTemp * 10) / 10.0;
  if (!isnan(sensorHum))   doc["humidity"]    = round(sensorHum * 10) / 10.0;
  if (!isnan(sensorLight)) doc["light"]       = round(sensorLight);
  if (!isnan(sensorNoise)) doc["noise"]       = round(sensorNoise * 10) / 10.0;
  doc["motion"] = sensorMotion ? 1 : 0;
  // pressure и co2 — не отправляем (нет данных)
  String body; serializeJson(doc, body);
  int code = http.POST(body); http.end();
  if (code == 200) { Serial.println("[HTTP] POST OK: " + body); return true; }
  return false;
}

bool postPomodoroEvent(const char *t, int d) {
  if (!wifiConnected) return false;
  HTTPClient http; http.begin(API_POMO_URL); http.addHeader("Content-Type", "application/json"); http.setTimeout(5000);
  JsonDocument doc; doc["type"] = t; doc["duration"] = d;
  String body; serializeJson(doc, body); int code = http.POST(body); http.end(); return (code == 200);
}

// ============================================================
//  WiFi
// ============================================================
void wifiConnect() {
  Serial.printf("[WiFi] Connecting to %s\n", WIFI_SSID);
  lcdPrint("Connecting WiFi ", WIFI_SSID); setLED(0, 0, 200);
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) { delay(500); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true; char ip[17]; WiFi.localIP().toString().toCharArray(ip, 17);
    lcdPrint("WiFi Connected! ", ip); setLED(0, 200, 0); beepOK(); delay(2000);
    Serial.println("[WiFi] IP: " + WiFi.localIP().toString());
  } else {
    wifiConnected = false; lcdPrint("WiFi FAILED     ", "Working offline "); delay(2000);
  }
}

// ============================================================
//  Pomodoro / Buttons
// ============================================================
void pomoStart() { pomoMode = POMO_WORK; pomoStartTime = millis(); pomoSecondsLeft = POMO_WORK_MIN * 60; lcdPrint("Pomodoro START! ", "Work time! :)   "); beepOK(); delay(1000); }
void pomoStop()  { pomoMode = POMO_IDLE; lcdPrint("Pomodoro STOP   ", "                "); beepOK(); delay(800); }

void updatePomodoro() {
  if (pomoMode == POMO_IDLE) return;
  uint32_t el = (millis() - pomoStartTime) / 1000;
  if (pomoMode == POMO_WORK) {
    int left = POMO_WORK_MIN * 60 - (int)el; pomoSecondsLeft = max(0, left);
    if (left <= 0) { pomoCycles++; postPomodoroEvent("work", POMO_WORK_MIN); beepPomoDone(); lcdPrint("WORK DONE! Great", "Take a break!   "); delay(2000); pomoMode = POMO_BREAK; pomoStartTime = millis(); pomoSecondsLeft = POMO_BREAK_MIN * 60; }
  } else {
    int left = POMO_BREAK_MIN * 60 - (int)el; pomoSecondsLeft = max(0, left);
    if (left <= 0) { postPomodoroEvent("break", POMO_BREAK_MIN); beepOK(); lcdPrint("Break over!     ", "Press OK to cont"); pomoMode = POMO_IDLE; }
  }
}

uint32_t btnModeLast = 0, btnOKLast = 0;
const uint32_t DEBOUNCE_MS = 200;
void handleButtons() {
  uint32_t now = millis();
  if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) { isrBtnMode = false; btnModeLast = now; displayPage = (displayPage + 1) % DISPLAY_PAGES; updateDisplay(); beepOK(); }
  if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) { isrBtnOK = false; btnOKLast = now; if (pomoMode == POMO_IDLE) pomoStart(); else pomoStop(); }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== NEXIS v03: DHT11 (без BME280) ===");
  Serial.println("    T/H через DHT11, без давления, без CO2");

  pinMode(PIN_PIR, INPUT); pinMode(PIN_BTN_MODE, INPUT_PULLUP); pinMode(PIN_BTN_OK, INPUT_PULLUP);
  pinMode(PIN_LED_R, OUTPUT); pinMode(PIN_LED_G, OUTPUT); pinMode(PIN_LED_B, OUTPUT); pinMode(PIN_BUZZER, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);
  analogReadResolution(12); analogSetAttenuation(ADC_11db);
  setLED(0, 0, 50);

  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init(); lcd.backlight(); lcdPrint("NEXIS v03       ", "DHT11 mode...   "); delay(500);

  // DHT11 — нужно время для стабилизации
  dht.begin();
  Serial.println("[OK] DHT11 (GPIO4) — ждём 2 сек...");
  lcdPrint("DHT11   OK      ", "Warming up...   ");
  delay(2000);

  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, I2C_BH1750_ADDR)) {
    Serial.println("[OK] BH1750"); lcdPrint("BH1750  OK      ", "                "); delay(500);
  } else {
    Serial.println("[ERR] BH1750!"); lcdPrint("BH1750 ERROR!   ", "Check I2C 0x23  "); delay(2000);
  }

  wifiConnect();

  // Первый замер DHT11 часто NaN — делаем несколько попыток
  for (int i = 0; i < 3; i++) {
    readDHT11();
    if (!isnan(sensorTemp)) break;
    delay(2500);
  }
  readBH1750(); readNoise(); readPIR();
  alertLevel = checkThresholds(); updateLED(); updateDisplay();

  Serial.println("─────────────────────────────");
  Serial.printf("DHT11:  T=%.1f°C  H=%.1f%%\n", sensorTemp, sensorHum);
  Serial.printf("BH1750: %.0f lux\n", sensorLight);
  Serial.printf("KY-037: %.1f dB\n", sensorNoise);
  Serial.printf("PIR:    %s\n", sensorMotion ? "MOTION" : "clear");
  Serial.println("[OK] Setup complete (без давления, без CO2)!");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
  uint32_t now = millis();

  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    readDHT11(); readBH1750(); readNoise(); readPIR();

    AlertLevel prev = alertLevel; alertLevel = checkThresholds();
    if (alertLevel == ALERT_DANGER && prev != ALERT_DANGER) beepDanger();
    else if (alertLevel == ALERT_WARN && prev == ALERT_OK) beepWarn();
    updateLED();

    Serial.println("─────────────────────────────");
    Serial.printf("DHT11: T=%.1f°C  H=%.1f%%\n", sensorTemp, sensorHum);
    Serial.printf("Light=%.0f lux  Noise=%.1f dB  PIR=%s\n", sensorLight, sensorNoise, sensorMotion ? "MOTION" : "clear");
    if (alertLevel != ALERT_OK) Serial.println("ALERT: " + alertMessage);
    Serial.println("POST: " + String(postSensorData() ? "OK" : "FAILED"));
  }

  if (now - lastDisplayChange >= DISPLAY_INTERVAL_MS) { lastDisplayChange = now; displayPage = (displayPage + 1) % DISPLAY_PAGES; updateDisplay(); }
  updatePomodoro(); handleButtons();

  if (now - lastWifiCheck >= WIFI_RECONNECT_MS) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) { wifiConnected = false; WiFi.reconnect(); uint32_t t = millis(); while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(500); wifiConnected = (WiFi.status() == WL_CONNECTED); }
    else wifiConnected = true;
  }

  delay(10);
}
```

---

**Отличия от TEST BUILD:**
- DHT11 вместо BME280 → нет давления
- 4 LCD страницы вместо 5 (нет давления/CO2)
- JSON POST не содержит `pressure` и `co2`
- DHT11 требует 2 сек между чтениями (10 сек интервал — норм)
