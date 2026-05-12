/*
 * NEXIS Wellness Station — ESP32 Firmware v2.0 (TEST BUILD)
 * ──────────────────────────────────────────────────────────
 * Активные компоненты:
 *   BME280        — температура, влажность, давление (I2C 0x76)
 *   BH1750        — освещённость (I2C 0x23)
 *   LCD 1602      — дисплей (I2C 0x27)
 *   PIR HC-SR501  — присутствие (GPIO27)
 *   KY-037        — уровень шума (ADC GPIO39)
 *   RGB LED       — GPIO 13/12/14
 *   Зуммер        — GPIO 25
 *   Кнопка Mode   — GPIO 32
 *   Кнопка OK     — GPIO 33
 *
 * DHT11 / MQ-135 / ZM106-VOC — ОТКЛЮЧЕНЫ (нет в сборке)
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

// ============================================================
//  ОБЪЕКТЫ
// ============================================================

Adafruit_BME280   bme;
BH1750            lightMeter;
LiquidCrystal_I2C lcd(I2C_LCD, 16, 2);

// ============================================================
//  ДАННЫЕ ДАТЧИКОВ
// ============================================================

struct SensorData {
    float temperature = NAN;  // °C
    float humidity    = NAN;  // %
    float pressure    = NAN;  // hPa
    float light       = NAN;  // lux
    float noise       = NAN;  // dB
    bool  motion      = false;
} sensors;

// ============================================================
//  СОСТОЯНИЕ СИСТЕМЫ
// ============================================================

enum AlertLevel { ALERT_OK, ALERT_WARN, ALERT_DANGER };

struct SystemState {
    bool       wifiConnected = false;
    AlertLevel alertLevel    = ALERT_OK;
    String     alertMessage  = "";

    enum PomodoroMode { POMO_IDLE, POMO_WORK, POMO_BREAK } pomoMode = POMO_IDLE;
    uint32_t pomoStart       = 0;
    int      pomoSecondsLeft = 0;
    int      pomoCycles      = 0;

    uint8_t displayPage = 0;
    static const uint8_t DISPLAY_PAGES = 5;
} state;

// ============================================================
//  ТАЙМЕРЫ
// ============================================================

uint32_t lastSensorRead    = 0;
uint32_t lastDisplayChange = 0;
uint32_t lastWifiCheck     = 0;

// ============================================================
//  ISR — ПРЕРЫВАНИЯ
// ============================================================

volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;
volatile bool isrPIR     = false;

void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }
void IRAM_ATTR onPIR()     { isrPIR     = true; }

// ============================================================
//  RGB LED
// ============================================================

void setLED(uint8_t r, uint8_t g, uint8_t b) {
    analogWrite(PIN_LED_R, r);
    analogWrite(PIN_LED_G, g);
    analogWrite(PIN_LED_B, b);
}

void updateLED() {
    if (!state.wifiConnected) {
        bool blink = (millis() / 500) % 2;
        setLED(0, 0, blink ? 200 : 0);  // Синий мигающий — нет WiFi
        return;
    }
    if (state.pomoMode == SystemState::POMO_BREAK) { setLED(0, 0, 100);   return; }
    if (state.pomoMode == SystemState::POMO_WORK)  { setLED(0, 150, 50);  return; }

    switch (state.alertLevel) {
        case ALERT_OK:     setLED(0, 200, 0);   break;  // Зелёный
        case ALERT_WARN:   setLED(200, 150, 0); break;  // Жёлтый
        case ALERT_DANGER: setLED(255, 0, 0);   break;  // Красный
    }
}

// ============================================================
//  ЗУММЕР
// ============================================================

void beep(int freq, int ms) { tone(PIN_BUZZER, freq, ms); }

void beepOK()     { beep(1000, 100); }
void beepWarn()   { for (int i = 0; i < 3; i++) { beep(800, 150); delay(200); } }
void beepDanger() { for (int i = 0; i < 5; i++) { beep(500, 100); delay(150); } }
void beepPomoDone() {
    int melody[] = {1047, 1175, 1319, 1397};
    for (int n : melody) { beep(n, 200); delay(220); }
}

// ============================================================
//  LCD — ЭКРАНЫ
// ============================================================

void lcdPrint(const char *line1, const char *line2) {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(line1);
    lcd.setCursor(0, 1); lcd.print(line2);
}

void lcdPrintf(uint8_t row, const char *fmt, ...) {
    char buf[17] = {};
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, 17, fmt, args);
    va_end(args);
    for (int i = strlen(buf); i < 16; i++) buf[i] = ' ';
    lcd.setCursor(0, row);
    lcd.print(buf);
}

void updateDisplay() {
    switch (state.displayPage) {

        case 0:  // Температура + Влажность
            if (!isnan(sensors.temperature)) {
                lcdPrintf(0, "Temp:  %5.1f C  ", sensors.temperature);
                lcdPrintf(1, "Hum:   %5.1f %%  ", sensors.humidity);
            } else {
                lcdPrint("BME280 ERROR    ", "Check I2C 0x76  ");
            }
            break;

        case 1:  // Давление + Освещённость
            if (!isnan(sensors.pressure)) {
                lcdPrintf(0, "Press:%6.1f hPa", sensors.pressure);
            } else {
                lcdPrintf(0, "Pressure: N/A   ");
            }
            if (!isnan(sensors.light)) {
                lcdPrintf(1, "Light:%6.0f lux", sensors.light);
            } else {
                lcdPrintf(1, "Light:  N/A     ");
            }
            break;

        case 2:  // Шум + Движение
            if (!isnan(sensors.noise)) {
                lcdPrintf(0, "Noise: %5.1f dB ", sensors.noise);
            } else {
                lcdPrintf(0, "Noise:  N/A     ");
            }
            lcdPrintf(1, "Motion: %s", sensors.motion ? "YES !" : "No   ");
            break;

        case 3:  // WiFi статус
            lcdPrintf(0, "WiFi: %s", state.wifiConnected ? "Connected" : "NO CONN  ");
            if (!state.alertMessage.isEmpty()) {
                char buf[17];
                state.alertMessage.toCharArray(buf, 17);
                lcdPrintf(1, "%s", buf);
            } else {
                lcdPrintf(1, "All sensors OK  ");
            }
            break;

        case 4:  // Pomodoro
            if (state.pomoMode == SystemState::POMO_IDLE) {
                lcdPrint("Pomodoro: IDLE  ", "Press OK to start");
            } else {
                int m = state.pomoSecondsLeft / 60;
                int s = state.pomoSecondsLeft % 60;
                const char *modeStr = (state.pomoMode == SystemState::POMO_WORK) ? "WORK" : "REST";
                lcdPrintf(0, "Pomo [%s] #%d  ", modeStr, state.pomoCycles + 1);
                lcdPrintf(1, "Time: %02d:%02d     ", m, s);
            }
            break;
    }
}

// ============================================================
//  ЧТЕНИЕ ДАТЧИКОВ
// ============================================================

void readBME280() {
    sensors.temperature = bme.readTemperature();
    sensors.humidity    = bme.readHumidity();
    sensors.pressure    = bme.readPressure() / 100.0f;

    if (sensors.temperature < -40 || sensors.temperature > 85) sensors.temperature = NAN;
    if (sensors.humidity < 0    || sensors.humidity > 100)     sensors.humidity    = NAN;
    if (sensors.pressure < 870  || sensors.pressure > 1085)    sensors.pressure    = NAN;
}

void readBH1750() {
    float lux = lightMeter.readLightLevel();
    if (lux >= 0) sensors.light = lux;
}

void readNoise() {
    int peak = 0;
    for (int i = 0; i < 20; i++) {
        int v = analogRead(PIN_NOISE);
        if (v > peak) peak = v;
        delay(2);
    }
    sensors.noise = NOISE_DB_MIN + (peak / 4095.0f) * (NOISE_DB_MAX - NOISE_DB_MIN);
}

void readPIR() {
    if (isrPIR) {
        sensors.motion = true;
        isrPIR = false;
    } else {
        sensors.motion = (digitalRead(PIN_PIR) == HIGH);
    }
}

// ============================================================
//  ПОРОГОВЫЕ ЗНАЧЕНИЯ
// ============================================================

AlertLevel checkThresholds() {
    AlertLevel level = ALERT_OK;
    state.alertMessage = "";

    if (!isnan(sensors.temperature)) {
        if (sensors.temperature > THRESH_TEMP_DANGER) {
            level = ALERT_DANGER;
            state.alertMessage = "TEMP TOO HIGH!";
        } else if (sensors.temperature > THRESH_TEMP_WARN && level < ALERT_WARN) {
            level = ALERT_WARN;
            state.alertMessage = "Temp elevated";
        }
    }

    if (!isnan(sensors.humidity)) {
        if (sensors.humidity > THRESH_HUM_DANGER) {
            level = ALERT_DANGER;
            if (state.alertMessage.isEmpty()) state.alertMessage = "HUMIDITY HIGH!";
        } else if (sensors.humidity > THRESH_HUM_WARN && level < ALERT_WARN) {
            level = ALERT_WARN;
            if (state.alertMessage.isEmpty()) state.alertMessage = "Humidity high";
        }
    }

    if (!isnan(sensors.light) && sensors.light > 0) {
        if (sensors.light < THRESH_LIGHT_DANGER) {
            if (level < ALERT_DANGER) { level = ALERT_DANGER; state.alertMessage = "LIGHT TOO LOW!"; }
        } else if (sensors.light < THRESH_LIGHT_WARN && level < ALERT_WARN) {
            level = ALERT_WARN;
            if (state.alertMessage.isEmpty()) state.alertMessage = "Light low";
        }
    }

    if (!isnan(sensors.noise)) {
        if (sensors.noise > THRESH_NOISE_DANGER) {
            if (level < ALERT_DANGER) { level = ALERT_DANGER; state.alertMessage = "NOISE TOO HIGH!"; }
        } else if (sensors.noise > THRESH_NOISE_WARN && level < ALERT_WARN) {
            level = ALERT_WARN;
            if (state.alertMessage.isEmpty()) state.alertMessage = "Noise elevated";
        }
    }

    return level;
}

// ============================================================
//  ОТПРАВКА НА СЕРВЕР
// ============================================================

bool postSensorData() {
    if (!state.wifiConnected) return false;

    HTTPClient http;
    http.begin(API_DATA_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);

    JsonDocument doc;
    if (!isnan(sensors.temperature)) doc["temperature"] = round(sensors.temperature * 10) / 10.0;
    if (!isnan(sensors.humidity))    doc["humidity"]    = round(sensors.humidity * 10) / 10.0;
    if (!isnan(sensors.pressure))    doc["pressure"]    = round(sensors.pressure * 10) / 10.0;
    if (!isnan(sensors.light))       doc["light"]       = round(sensors.light);
    if (!isnan(sensors.noise))       doc["noise"]       = round(sensors.noise * 10) / 10.0;
    doc["motion"] = sensors.motion ? 1 : 0;

    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    http.end();

    if (code == 200) {
        Serial.printf("[HTTP] POST OK: %s\n", body.c_str());
        return true;
    }
    Serial.printf("[HTTP] POST failed: %d\n", code);
    return false;
}

bool postPomodoroEvent(const char *type, int durationMin) {
    if (!state.wifiConnected) return false;

    HTTPClient http;
    http.begin(API_POMO_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);

    JsonDocument doc;
    doc["type"]     = type;
    doc["duration"] = durationMin;

    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    http.end();
    return (code == 200);
}

// ============================================================
//  WiFi
// ============================================================

void wifiConnect() {
    Serial.printf("[WiFi] Connecting to %s ...\n", WIFI_SSID);
    lcdPrint("Connecting WiFi ", WIFI_SSID);
    setLED(0, 0, 200);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    uint32_t t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        state.wifiConnected = true;
        Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
        char ipStr[17];
        WiFi.localIP().toString().toCharArray(ipStr, 17);
        lcdPrint("WiFi Connected! ", ipStr);
        setLED(0, 200, 0);
        beepOK();
        delay(2000);
    } else {
        state.wifiConnected = false;
        Serial.println("[WiFi] FAILED — working offline");
        lcdPrint("WiFi FAILED     ", "Working offline ");
        delay(2000);
    }
}

// ============================================================
//  POMODORO
// ============================================================

void pomoStart() {
    state.pomoMode        = SystemState::POMO_WORK;
    state.pomoStart       = millis();
    state.pomoSecondsLeft = POMO_WORK_MIN * 60;
    lcdPrint("Pomodoro START! ", "Work time! :)   ");
    beepOK();
    delay(1000);
    Serial.printf("[Pomo] Started — cycle #%d\n", state.pomoCycles + 1);
}

void pomoStop() {
    state.pomoMode = SystemState::POMO_IDLE;
    lcdPrint("Pomodoro STOP   ", "                ");
    beepOK();
    delay(800);
    Serial.println("[Pomo] Stopped");
}

void updatePomodoro() {
    if (state.pomoMode == SystemState::POMO_IDLE) return;

    uint32_t elapsed = (millis() - state.pomoStart) / 1000;

    if (state.pomoMode == SystemState::POMO_WORK) {
        int left = POMO_WORK_MIN * 60 - (int)elapsed;
        state.pomoSecondsLeft = max(0, left);
        if (left <= 0) {
            state.pomoCycles++;
            postPomodoroEvent("work", POMO_WORK_MIN);
            beepPomoDone();
            lcdPrint("WORK DONE! Great", "Take a break!   ");
            delay(2000);
            state.pomoMode        = SystemState::POMO_BREAK;
            state.pomoStart       = millis();
            state.pomoSecondsLeft = POMO_BREAK_MIN * 60;
        }
    } else if (state.pomoMode == SystemState::POMO_BREAK) {
        int left = POMO_BREAK_MIN * 60 - (int)elapsed;
        state.pomoSecondsLeft = max(0, left);
        if (left <= 0) {
            postPomodoroEvent("break", POMO_BREAK_MIN);
            beepOK();
            lcdPrint("Break over!     ", "Press OK to cont");
            state.pomoMode = SystemState::POMO_IDLE;
        }
    }
}

// ============================================================
//  КНОПКИ
// ============================================================

uint32_t btnModeLast = 0, btnOKLast = 0;
const uint32_t DEBOUNCE_MS = 200;

void handleButtons() {
    uint32_t now = millis();

    if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) {
        isrBtnMode  = false;
        btnModeLast = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
        beepOK();
    }

    if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) {
        isrBtnOK  = false;
        btnOKLast = now;
        if (state.pomoMode == SystemState::POMO_IDLE) pomoStart();
        else                                          pomoStop();
    }
}

// ============================================================
//  SETUP
// ============================================================

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== NEXIS Wellness Station v2.0 [TEST BUILD] ===");
    Serial.println("    Active: BME280, BH1750, LCD, PIR, KY-037, LED, Buzzer, Buttons");
    Serial.println("    Skipped: DHT11, MQ-135, ZM106-VOC");

    // Пины
    pinMode(PIN_PIR,      INPUT);
    pinMode(PIN_BTN_MODE, INPUT_PULLUP);
    pinMode(PIN_BTN_OK,   INPUT_PULLUP);
    pinMode(PIN_LED_R,    OUTPUT);
    pinMode(PIN_LED_G,    OUTPUT);
    pinMode(PIN_LED_B,    OUTPUT);
    pinMode(PIN_BUZZER,   OUTPUT);

    // Прерывания
    attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
    attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
    attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);
    Serial.println("[OK] Interrupts: BTN_MODE, BTN_OK, PIR");

    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    setLED(0, 0, 50);

    // I2C
    Wire.begin(I2C_SDA, I2C_SCL);

    // LCD
    lcd.init();
    lcd.backlight();
    lcdPrint("NEXIS Wellness  ", "Initializing... ");
    delay(500);

    // BME280
    if (bme.begin(I2C_BME280)) {
        bme.setSampling(Adafruit_BME280::MODE_NORMAL,
                        Adafruit_BME280::SAMPLING_X2,
                        Adafruit_BME280::SAMPLING_X16,
                        Adafruit_BME280::SAMPLING_X1,
                        Adafruit_BME280::FILTER_X16,
                        Adafruit_BME280::STANDBY_MS_0_5);
        Serial.println("[OK] BME280 (0x76)");
        lcdPrint("BME280  OK      ", "                ");
    } else {
        Serial.println("[ERR] BME280 NOT FOUND — check SDA/SCL and 3.3V");
        lcdPrint("BME280 ERROR!   ", "Check I2C 0x76  ");
        delay(2000);
    }

    // BH1750
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, I2C_BH1750)) {
        Serial.println("[OK] BH1750 (0x23)");
        lcdPrint("BH1750  OK      ", "                ");
    } else {
        Serial.println("[ERR] BH1750 NOT FOUND — check ADDR→GND and 3.3V");
        lcdPrint("BH1750 ERROR!   ", "Check I2C 0x23  ");
        delay(2000);
    }
    delay(300);

    // WiFi
    wifiConnect();

    // Первое чтение
    readBME280();
    readBH1750();
    readNoise();
    readPIR();

    state.alertLevel = checkThresholds();
    updateLED();
    updateDisplay();

    Serial.println("[OK] Setup complete!\n");
    Serial.println("─────────────────────────────");
    Serial.printf("BME280: T=%.1f°C  H=%.1f%%  P=%.1f hPa\n",
        sensors.temperature, sensors.humidity, sensors.pressure);
    Serial.printf("BH1750: %.0f lux\n", sensors.light);
    Serial.printf("KY-037: %.1f dB\n", sensors.noise);
    Serial.printf("PIR:    %s\n", sensors.motion ? "MOTION" : "clear");
    Serial.println("─────────────────────────────");
}

// ============================================================
//  LOOP
// ============================================================

void loop() {
    uint32_t now = millis();

    // Чтение датчиков каждые 10 секунд
    if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
        lastSensorRead = now;

        readBME280();
        readBH1750();
        readNoise();
        readPIR();

        AlertLevel prevAlert = state.alertLevel;
        state.alertLevel = checkThresholds();

        if (state.alertLevel == ALERT_DANGER && prevAlert != ALERT_DANGER) {
            beepDanger();
        } else if (state.alertLevel == ALERT_WARN && prevAlert == ALERT_OK) {
            beepWarn();
        }

        updateLED();

        Serial.println("─────────────────────────────");
        Serial.printf("BME280: T=%.1f°C  H=%.1f%%  P=%.1f hPa\n",
            sensors.temperature, sensors.humidity, sensors.pressure);
        Serial.printf("BH1750: %.0f lux\n", sensors.light);
        Serial.printf("KY-037: %.1f dB\n", sensors.noise);
        Serial.printf("PIR:    %s\n", sensors.motion ? "MOTION DETECTED" : "clear");
        if (state.alertLevel != ALERT_OK) {
            Serial.printf("ALERT [%s]: %s\n",
                state.alertLevel == ALERT_DANGER ? "DANGER" : "WARN",
                state.alertMessage.c_str());
        }

        bool sent = postSensorData();
        Serial.printf("Server POST: %s\n", sent ? "OK" : "FAILED (offline?)");
    }

    // Смена экрана LCD каждые 3 секунды
    if (now - lastDisplayChange >= DISPLAY_INTERVAL_MS) {
        lastDisplayChange = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
    }

    updatePomodoro();
    handleButtons();

    // Переподключение WiFi
    if (now - lastWifiCheck >= WIFI_RECONNECT_MS) {
        lastWifiCheck = now;
        if (WiFi.status() != WL_CONNECTED) {
            state.wifiConnected = false;
            WiFi.reconnect();
            uint32_t t = millis();
            while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(500);
            state.wifiConnected = (WiFi.status() == WL_CONNECTED);
            if (state.wifiConnected)
                Serial.printf("[WiFi] Reconnected: %s\n", WiFi.localIP().toString().c_str());
        } else {
            state.wifiConnected = true;
        }
    }

    delay(10);
}
