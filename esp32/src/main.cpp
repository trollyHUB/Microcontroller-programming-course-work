/*
 * NEXIS Wellness Station — ESP32 Firmware v2.0
 * ─────────────────────────────────────────────
 * Датчики:
 *   BME280        — температура, влажность, давление (I2C 0x76) ⭐ основной
 *   DHT11         — температура, влажность (GPIO4)               доп.
 *   Winsen ZM106-VOC — CO₂/VOC (UART Serial2, GPIO16/17)       ⭐ основной
 *   MQ-135        — CO₂ аналоговый (ADC GPIO36)                 доп.
 *   BH1750        — освещённость (I2C 0x23)
 *   PIR HC-SR501  — присутствие (GPIO27)
 *   KY-037        — уровень шума (ADC GPIO39)
 *
 * Дисплей:  LCD 1602 (I2C 0x27)
 * RGB LED:  GPIO 13/12/14
 * Зуммер:   GPIO 25
 * Кнопки:   GPIO 32 (Mode), 33 (OK)
 *
 * Сборка: PlatformIO, platform=espressif32, board=esp32dev
 * Настройте config.h перед прошивкой!
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_BME280.h>
#include <DHT.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

// ============================================================
//  ОБЪЕКТЫ ДАТЧИКОВ И ДИСПЛЕЯ
// ============================================================

Adafruit_BME280 bme;
DHT             dht(PIN_DHT11, DHT11);
BH1750          lightMeter;
LiquidCrystal_I2C lcd(I2C_LCD, 16, 2);

// ============================================================
//  ДАННЫЕ ДАТЧИКОВ
// ============================================================

struct SensorData {
    // BME280 (основной)
    float temperature = NAN;  // °C
    float humidity    = NAN;  // %
    float pressure    = NAN;  // hPa

    // ZM106-VOC (основной CO₂/VOC)
    float  co2        = NAN;  // ppm
    bool   zm106OK    = false;

    // BH1750
    float  light      = NAN;  // lux

    // KY-037 (шум)
    float  noise      = NAN;  // dB (расчётное)

    // PIR
    bool   motion     = false;

    // DHT11 (дополнительный)
    float  dht_temp   = NAN;
    float  dht_hum    = NAN;

    // MQ-135 (дополнительный, сырое значение)
    int    mq135Raw   = 0;
} sensors;

// ============================================================
//  СОСТОЯНИЕ СИСТЕМЫ
// ============================================================

enum AlertLevel { ALERT_OK, ALERT_WARN, ALERT_DANGER };

struct SystemState {
    bool        wifiConnected  = false;
    AlertLevel  alertLevel     = ALERT_OK;
    String      alertMessage   = "";

    // Pomodoro
    enum PomodoroMode { POMO_IDLE, POMO_WORK, POMO_BREAK } pomoMode = POMO_IDLE;
    uint32_t    pomoStart      = 0;
    int         pomoSecondsLeft = 0;
    int         pomoCycles     = 0;

    // LCD экраны
    uint8_t     displayPage    = 0;
    static const uint8_t DISPLAY_PAGES = 5;
} state;

// ============================================================
//  ТАЙМЕРЫ
// ============================================================

uint32_t lastSensorRead   = 0;
uint32_t lastServerPost   = 0;
uint32_t lastDisplayChange = 0;
uint32_t lastZM106Read    = 0;
uint32_t lastWifiCheck    = 0;

// ============================================================
//  ZM106-VOC — UART ПРОТОКОЛ WINSEN
// ============================================================

// Команда запроса концентрации газа (FF 01 86 + 5 нулей + CRC)
const uint8_t ZM106_CMD_READ[9] = {0xFF, 0x01, 0x86, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79};

uint8_t zm106CalcCRC(uint8_t *buf, int len) {
    uint8_t sum = 0;
    for (int i = 1; i < len - 1; i++) sum += buf[i];
    return (~sum) + 1;
}

bool zm106ReadConcentration(float &ppm) {
    // Очистить буфер перед запросом
    while (Serial2.available()) Serial2.read();

    // Отправить команду чтения
    Serial2.write(ZM106_CMD_READ, 9);

    // Ждать ответ (макс 500 мс)
    uint32_t t = millis();
    while (Serial2.available() < 9) {
        if (millis() - t > 500) return false;
        delay(10);
    }

    uint8_t resp[9];
    Serial2.readBytes(resp, 9);

    // Проверить стартовый байт и команду
    if (resp[0] != 0xFF || resp[1] != 0x86) return false;

    // Проверить CRC
    if (zm106CalcCRC(resp, 9) != resp[8]) return false;

    uint16_t raw = ((uint16_t)resp[2] << 8) | resp[3];
    ppm = (float)raw;
    return (ppm >= 0 && ppm <= 10000);
}

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
        // Синий мигающий — нет WiFi
        bool blink = (millis() / 500) % 2;
        setLED(0, 0, blink ? 200 : 0);
        return;
    }
    if (state.pomoMode == SystemState::POMO_BREAK) {
        setLED(0, 0, 100);   // Синий — перерыв
        return;
    }
    if (state.pomoMode == SystemState::POMO_WORK) {
        setLED(0, 150, 50);  // Зелёно-голубой — работа
        return;
    }
    switch (state.alertLevel) {
        case ALERT_OK:     setLED(0, 200, 0);    break;  // Зелёный
        case ALERT_WARN:   setLED(200, 150, 0);  break;  // Жёлтый
        case ALERT_DANGER: setLED(255, 0, 0);    break;  // Красный
    }
}

// ============================================================
//  ЗУММЕР
// ============================================================

void beep(int freq, int ms) {
    tone(PIN_BUZZER, freq, ms);
}

void beepOK()    { beep(1000, 100); }
void beepWarn()  { for (int i = 0; i < 3; i++) { beep(800, 150); delay(200); } }
void beepDanger(){ for (int i = 0; i < 5; i++) { beep(500, 100); delay(150); } }
void beepPomoDone() {
    int melody[] = {1047, 1175, 1319, 1397};
    for (int n : melody) { beep(n, 200); delay(220); }
}

// ============================================================
//  LCD ДИСПЛЕЙ — ЭКРАНЫ
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
    // Дополнить пробелами до 16 символов
    for (int i = strlen(buf); i < 16; i++) buf[i] = ' ';
    lcd.setCursor(0, row);
    lcd.print(buf);
}

void updateDisplay() {
    switch (state.displayPage) {

        case 0: // Температура и влажность (BME280)
            if (!isnan(sensors.temperature)) {
                lcdPrintf(0, "Temp:  %5.1f C  ", sensors.temperature);
                lcdPrintf(1, "Hum:   %5.1f %%  ", sensors.humidity);
            } else {
                lcdPrint("BME280 ERROR    ", "Check wiring!   ");
            }
            break;

        case 1: // CO₂/VOC (ZM106) и давление
            if (sensors.zm106OK) {
                lcdPrintf(0, "CO2:%5.0f ppm   ", sensors.co2);
            } else {
                lcdPrint("ZM106 ERROR     ", "Check UART!     ");
            }
            if (!isnan(sensors.pressure)) {
                lcdPrintf(1, "Press:%6.1f hPa", sensors.pressure);
            } else {
                lcdPrintf(1, "Pressure: N/A   ");
            }
            break;

        case 2: // Освещённость и шум
            if (!isnan(sensors.light)) {
                lcdPrintf(0, "Light:%6.0f lux", sensors.light);
            } else {
                lcdPrint("BH1750 ERROR    ", "                ");
            }
            if (!isnan(sensors.noise)) {
                lcdPrintf(1, "Noise: %5.1f dB ", sensors.noise);
            } else {
                lcdPrintf(1, "Noise: N/A      ");
            }
            break;

        case 3: // Движение и статус WiFi
        {
            const char *motionStr = sensors.motion ? "YES  (!)        " : "No              ";
            lcdPrintf(0, "Motion: %s", motionStr);
            if (state.wifiConnected) {
                lcdPrint("                ", "WiFi: Connected ");
            } else {
                lcdPrint("                ", "WiFi: NO CONN   ");
            }
            break;
        }

        case 4: // Pomodoro таймер
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
    sensors.pressure    = bme.readPressure() / 100.0f;  // Pa → hPa

    // Санитарная проверка
    if (sensors.temperature < -40 || sensors.temperature > 85) sensors.temperature = NAN;
    if (sensors.humidity < 0    || sensors.humidity > 100)     sensors.humidity    = NAN;
    if (sensors.pressure < 870  || sensors.pressure > 1085)    sensors.pressure    = NAN;
}

void readDHT11() {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
        sensors.dht_temp = t;
        sensors.dht_hum  = h;
    }
}

void readZM106() {
    float ppm;
    if (zm106ReadConcentration(ppm)) {
        sensors.co2    = ppm;
        sensors.zm106OK = true;
    } else {
        sensors.zm106OK = false;
        Serial.println("[ZM106] Read failed");
    }
}

void readBH1750() {
    float lux = lightMeter.readLightLevel();
    if (lux >= 0) sensors.light = lux;
}

void readNoise() {
    // Сделать несколько замеров и взять максимум (шум импульсный)
    int peak = 0;
    for (int i = 0; i < 20; i++) {
        int v = analogRead(PIN_NOISE);
        if (v > peak) peak = v;
        delay(2);
    }
    sensors.noise = NOISE_DB_MIN + (peak / 4095.0f) * (NOISE_DB_MAX - NOISE_DB_MIN);
}

void readPIR() {
    sensors.motion = (digitalRead(PIN_PIR) == HIGH);
}

void readMQ135() {
    sensors.mq135Raw = analogRead(PIN_MQ135);
    // Используем как доп. данные; отправляем на сервер только ZM106
}

// ============================================================
//  ПРОВЕРКА ПОРОГОВЫХ ЗНАЧЕНИЙ
// ============================================================

AlertLevel checkThresholds() {
    AlertLevel level = ALERT_OK;
    state.alertMessage = "";

    if (sensors.zm106OK && sensors.co2 > THRESH_CO2_DANGER) {
        level = ALERT_DANGER;
        state.alertMessage = "CO2 CRITICAL!";
    } else if (sensors.zm106OK && sensors.co2 > THRESH_CO2_WARN) {
        if (level < ALERT_WARN) level = ALERT_WARN;
        state.alertMessage = "CO2 HIGH! Ventilate";
    }

    if (!isnan(sensors.temperature)) {
        if (sensors.temperature > THRESH_TEMP_DANGER) {
            level = ALERT_DANGER;
            state.alertMessage = "TEMP TOO HIGH!";
        } else if (sensors.temperature > THRESH_TEMP_WARN && level < ALERT_WARN) {
            level = ALERT_WARN;
        }
    }

    if (!isnan(sensors.light) && sensors.light > 0) {
        if (sensors.light < THRESH_LIGHT_DANGER) {
            if (level < ALERT_DANGER) level = ALERT_WARN;
        }
    }

    if (!isnan(sensors.noise)) {
        if (sensors.noise > THRESH_NOISE_DANGER) {
            if (level < ALERT_DANGER) level = ALERT_WARN;
        }
    }

    return level;
}

// ============================================================
//  ОТПРАВКА ДАННЫХ НА СЕРВЕР
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
    if (sensors.zm106OK)             doc["co2"]         = round(sensors.co2);
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
        Serial.println("[WiFi] Connection FAILED — working offline");
        lcdPrint("WiFi FAILED     ", "Working offline ");
        delay(2000);
    }
}

// ============================================================
//  POMODORO
// ============================================================

void pomoStart() {
    state.pomoMode   = SystemState::POMO_WORK;
    state.pomoStart  = millis();
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
            // Рабочий цикл завершён
            state.pomoCycles++;
            Serial.printf("[Pomo] Work done! Cycle #%d complete.\n", state.pomoCycles);
            postPomodoroEvent("work", POMO_WORK_MIN);
            beepPomoDone();
            lcdPrint("WORK DONE! Great", "Take a break!   ");
            delay(2000);

            state.pomoMode  = SystemState::POMO_BREAK;
            state.pomoStart = millis();
            state.pomoSecondsLeft = POMO_BREAK_MIN * 60;
        }
    } else if (state.pomoMode == SystemState::POMO_BREAK) {
        int left = POMO_BREAK_MIN * 60 - (int)elapsed;
        state.pomoSecondsLeft = max(0, left);

        if (left <= 0) {
            // Перерыв завершён
            Serial.println("[Pomo] Break done — ready for next cycle");
            postPomodoroEvent("break", POMO_BREAK_MIN);
            beepOK();
            lcdPrint("Break over!     ", "Press OK to cont");
            state.pomoMode = SystemState::POMO_IDLE;
        }
    }
}

// ============================================================
//  КНОПКИ (с антидребезгом)
// ============================================================

uint32_t btnModeLast = 0, btnOKLast = 0;
const uint32_t DEBOUNCE_MS = 200;

void handleButtons() {
    uint32_t now = millis();

    // Кнопка MODE — смена экрана
    if (digitalRead(PIN_BTN_MODE) == LOW && now - btnModeLast > DEBOUNCE_MS) {
        btnModeLast = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
        beepOK();
    }

    // Кнопка OK — запуск/остановка Pomodoro
    if (digitalRead(PIN_BTN_OK) == LOW && now - btnOKLast > DEBOUNCE_MS) {
        btnOKLast = now;
        if (state.pomoMode == SystemState::POMO_IDLE) {
            pomoStart();
        } else {
            pomoStop();
        }
    }
}

// ============================================================
//  SETUP
// ============================================================

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== NEXIS Wellness Station v2.0 ===");

    // Пины
    pinMode(PIN_PIR,      INPUT);
    pinMode(PIN_BTN_MODE, INPUT_PULLUP);
    pinMode(PIN_BTN_OK,   INPUT_PULLUP);
    pinMode(PIN_LED_R,    OUTPUT);
    pinMode(PIN_LED_G,    OUTPUT);
    pinMode(PIN_LED_B,    OUTPUT);
    pinMode(PIN_BUZZER,   OUTPUT);

    analogReadResolution(12);   // ADC 12 бит (0–4095)
    analogSetAttenuation(ADC_11db); // Входной диапазон 0–3.3V

    setLED(0, 0, 50);  // Слабый синий пока инициализируем

    // I2C
    Wire.begin(I2C_SDA, I2C_SCL);

    // LCD
    lcd.init();
    lcd.backlight();
    lcdPrint("NEXIS Wellness  ", "Initializing... ");
    delay(500);

    // BME280 (основной датчик T/H/P)
    if (bme.begin(I2C_BME280)) {
        // Режим weatherStation: минимальное потребление
        bme.setSampling(Adafruit_BME280::MODE_NORMAL,
                        Adafruit_BME280::SAMPLING_X2,    // температура
                        Adafruit_BME280::SAMPLING_X16,   // давление
                        Adafruit_BME280::SAMPLING_X1,    // влажность
                        Adafruit_BME280::FILTER_X16,
                        Adafruit_BME280::STANDBY_MS_0_5);
        Serial.println("[OK] BME280 initialized");
    } else {
        Serial.println("[ERR] BME280 NOT FOUND — check I2C wiring (0x76)");
        lcdPrint("BME280 ERROR!   ", "Check I2C 0x76  ");
        delay(2000);
    }

    // DHT11 (доп.)
    dht.begin();
    Serial.println("[OK] DHT11 initialized");

    // BH1750
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, I2C_BH1750)) {
        Serial.println("[OK] BH1750 initialized");
    } else {
        Serial.println("[ERR] BH1750 NOT FOUND — check I2C wiring (0x23)");
    }

    // ZM106-VOC UART (Serial2)
    Serial2.begin(ZM106_BAUD, SERIAL_8N1, PIN_ZM106_RX, PIN_ZM106_TX);
    Serial.println("[OK] Serial2 (ZM106-VOC) initialized");
    delay(300);

    // Первое чтение ZM106
    readZM106();
    if (sensors.zm106OK) {
        Serial.printf("[OK] ZM106-VOC first read: %.0f ppm\n", sensors.co2);
    } else {
        Serial.println("[WARN] ZM106-VOC: no response (may need warm-up)");
    }

    // WiFi
    wifiConnect();

    // Первое чтение датчиков
    readBME280();
    readBH1750();
    readNoise();
    readPIR();
    readDHT11();
    readMQ135();

    state.alertLevel = checkThresholds();
    updateLED();
    updateDisplay();

    Serial.println("[OK] Setup complete — starting main loop");
    Serial.printf("     BME280:   T=%.1f C  H=%.1f%%  P=%.1f hPa\n",
        sensors.temperature, sensors.humidity, sensors.pressure);
    Serial.printf("     ZM106:    %.0f ppm (ok=%d)\n", sensors.co2, sensors.zm106OK);
    Serial.printf("     BH1750:   %.0f lux\n", sensors.light);
    Serial.printf("     KY-037:   %.1f dB\n", sensors.noise);
    Serial.printf("     PIR:      %s\n", sensors.motion ? "MOTION" : "clear");
}

// ============================================================
//  LOOP
// ============================================================

void loop() {
    uint32_t now = millis();

    // --- ZM106-VOC — опрос по UART каждые 5 секунд ---
    if (now - lastZM106Read >= ZM106_READ_INTERVAL_MS) {
        lastZM106Read = now;
        readZM106();
    }

    // --- Все остальные датчики + отправка на сервер ---
    if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
        lastSensorRead = now;

        readBME280();
        readBH1750();
        readNoise();
        readPIR();
        readDHT11();
        readMQ135();

        AlertLevel prevAlert = state.alertLevel;
        state.alertLevel = checkThresholds();

        // Звуковой сигнал при переходе к опасному уровню
        if (state.alertLevel == ALERT_DANGER && prevAlert != ALERT_DANGER) {
            beepDanger();
        } else if (state.alertLevel == ALERT_WARN && prevAlert == ALERT_OK) {
            beepWarn();
        }

        updateLED();

        // Вывод в Serial Monitor
        Serial.println("─────────────────────────────");
        Serial.printf("BME280: T=%.1f°C  H=%.1f%%  P=%.1f hPa\n",
            sensors.temperature, sensors.humidity, sensors.pressure);
        Serial.printf("ZM106:  CO2=%.0f ppm (ok=%d)\n", sensors.co2, sensors.zm106OK);
        Serial.printf("BH1750: %.0f lux\n", sensors.light);
        Serial.printf("KY-037: %.1f dB\n", sensors.noise);
        Serial.printf("PIR:    %s   MQ135(raw)=%d\n",
            sensors.motion ? "MOTION" : "clear", sensors.mq135Raw);
        if (!isnan(sensors.dht_temp)) {
            Serial.printf("DHT11:  T=%.1f°C  H=%.1f%%\n",
                sensors.dht_temp, sensors.dht_hum);
        }
        if (state.alertLevel != ALERT_OK) {
            Serial.printf("ALERT [%s]: %s\n",
                state.alertLevel == ALERT_DANGER ? "DANGER" : "WARN",
                state.alertMessage.c_str());
        }

        // Отправить на сервер
        bool sent = postSensorData();
        Serial.printf("Server POST: %s\n", sent ? "OK" : "FAILED");
    }

    // --- Смена экрана LCD ---
    if (now - lastDisplayChange >= DISPLAY_INTERVAL_MS) {
        lastDisplayChange = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
    }

    // --- Pomodoro ---
    updatePomodoro();

    // --- Кнопки ---
    handleButtons();

    // --- Проверка WiFi и переподключение ---
    if (now - lastWifiCheck >= WIFI_RECONNECT_MS) {
        lastWifiCheck = now;
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi] Lost connection — reconnecting...");
            state.wifiConnected = false;
            WiFi.reconnect();
            uint32_t t = millis();
            while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(500);
            state.wifiConnected = (WiFi.status() == WL_CONNECTED);
            if (state.wifiConnected) {
                Serial.printf("[WiFi] Reconnected: %s\n", WiFi.localIP().toString().c_str());
            }
        } else {
            state.wifiConnected = true;
        }
    }

    delay(10);
}
