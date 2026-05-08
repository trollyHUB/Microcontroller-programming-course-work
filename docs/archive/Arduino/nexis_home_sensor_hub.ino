/*
 * ═══════════════════════════════════════════════════════════════════
 *                    NEXIS HOME SENSOR HUB
 *           Курсовой проект по программированию микроконтроллеров
 * ═══════════════════════════════════════════════════════════════════
 *
 * Автор: Студент ЕНУ им. Гумилёва
 * Дата: Январь 2026
 * Версия: 1.0.0
 *
 * Описание:
 * IoT устройство для мониторинга параметров окружающей среды
 * с интеграцией в платформу NEXIS
 *
 * Датчики:
 * - DHT22: температура и влажность
 * - BMP280: атмосферное давление
 * - BH1750: освещённость
 * - MQ-135: качество воздуха
 * - PIR HC-SR501: датчик движения
 *
 * Связь: Wi-Fi (HTTP POST к NEXIS API)
 * Дисплей: OLED SSD1306 128x64
 *
 * ═══════════════════════════════════════════════════════════════════
 */

// ==================== БИБЛИОТЕКИ ====================

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_BMP280.h>
#include <BH1750.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <EEPROM.h>
#include <ArduinoOTA.h>
#include <WiFiManager.h>

// ==================== КОНФИГУРАЦИЯ ПИНОВ ====================

// DHT22 Датчик температуры и влажности
#define DHT_PIN D5          // GPIO14
#define DHT_TYPE DHT22

// MQ-135 Датчик качества воздуха
#define MQ135_PIN A0        // Аналоговый вход

// PIR Датчик движения
#define PIR_PIN D6          // GPIO12

// Зуммер
#define BUZZER_PIN D7       // GPIO13

// Кнопка
#define BUTTON_PIN D3       // GPIO0

// RGB LED
#define LED_R_PIN D4        // GPIO2
#define LED_G_PIN D8        // GPIO15
#define LED_B_PIN D0        // GPIO16

// I2C (для OLED, BMP280, BH1750)
#define SDA_PIN D2          // GPIO4
#define SCL_PIN D1          // GPIO5

// ==================== НАСТРОЙКИ ДИСПЛЕЯ ====================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ==================== ИНИЦИАЛИЗАЦИЯ ДАТЧИКОВ ====================

DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp;
BH1750 lightMeter;

// ==================== НАСТРОЙКИ NEXIS ====================

// Конфигурация по умолчанию (можно изменить через веб-интерфейс)
String nexisServer = "http://nexis.kz/api/home/sensors";
String deviceId = "nexis_home_001";
String roomName = "living_room";
int sendInterval = 30;  // секунды

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================

// Данные датчиков
struct SensorData {
    float temperature;
    float humidity;
    float pressure;
    int airQuality;
    float light;
    bool motionDetected;
    unsigned long lastMotionTime;
    int wifiSignal;
    unsigned long uptime;
} sensorData;

// Пороговые значения для оповещений
struct Thresholds {
    float tempMin = 18.0;
    float tempMax = 26.0;
    float humidityMin = 40.0;
    float humidityMax = 60.0;
    int airQualityMax = 400;
    float lightMin = 100.0;
} thresholds;

// Флаги состояния
bool wifiConnected = false;
bool sensorsOk = true;
bool displayOk = false;
bool bmpOk = false;
bool lightMeterOk = false;

// Таймеры
unsigned long lastSendTime = 0;
unsigned long lastReadTime = 0;
unsigned long lastDisplayUpdate = 0;

// Веб-сервер
ESP8266WebServer server(80);

// ==================== ФУНКЦИИ ИНИЦИАЛИЗАЦИИ ====================

void setup() {
    // Инициализация Serial для отладки
    Serial.begin(115200);
    Serial.println("\n\n");
    Serial.println("═══════════════════════════════════════════");
    Serial.println("       NEXIS HOME SENSOR HUB v1.0.0");
    Serial.println("═══════════════════════════════════════════");

    // Инициализация пинов
    initPins();

    // Инициализация I2C
    Wire.begin(SDA_PIN, SCL_PIN);

    // Инициализация OLED дисплея
    initDisplay();

    // Показываем загрузочный экран
    showBootScreen();

    // Инициализация датчиков
    initSensors();

    // Инициализация Wi-Fi
    initWiFi();

    // Инициализация веб-сервера
    initWebServer();

    // Инициализация OTA
    initOTA();

    // Загрузка настроек из EEPROM
    loadSettings();

    // Стартовое чтение датчиков
    readSensors();

    // Готово!
    showStatusScreen("READY", "System initialized");
    playTone(1000, 100);
    delay(100);
    playTone(1500, 100);

    Serial.println("✓ System ready!");
    Serial.println("═══════════════════════════════════════════\n");
}

void initPins() {
    Serial.print("Initializing pins... ");

    pinMode(PIR_PIN, INPUT);
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_R_PIN, OUTPUT);
    pinMode(LED_G_PIN, OUTPUT);
    pinMode(LED_B_PIN, OUTPUT);

    // Выключаем всё
    digitalWrite(BUZZER_PIN, LOW);
    setLedColor(0, 0, 0);

    Serial.println("OK");
}

void initDisplay() {
    Serial.print("Initializing OLED display... ");

    if (display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
        displayOk = true;
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }
}

void initSensors() {
    Serial.println("\nInitializing sensors:");

    // DHT22
    Serial.print("  DHT22... ");
    dht.begin();
    Serial.println("OK");

    // BMP280
    Serial.print("  BMP280... ");
    if (bmp.begin(0x76) || bmp.begin(0x77)) {
        bmpOk = true;
        bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                        Adafruit_BMP280::SAMPLING_X2,
                        Adafruit_BMP280::SAMPLING_X16,
                        Adafruit_BMP280::FILTER_X16,
                        Adafruit_BMP280::STANDBY_MS_500);
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }

    // BH1750
    Serial.print("  BH1750... ");
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
        lightMeterOk = true;
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }

    // MQ-135 (аналоговый, всегда доступен)
    Serial.println("  MQ-135... OK (analog)");

    // PIR
    Serial.println("  PIR HC-SR501... OK");

    Serial.println();
}

void initWiFi() {
    Serial.print("Connecting to WiFi");

    showStatusScreen("WiFi", "Connecting...");
    setLedColor(0, 0, 255);  // Синий - подключение

    // Используем WiFiManager для настройки WiFi
    WiFiManager wifiManager;
    wifiManager.setConfigPortalTimeout(180);  // 3 минуты на настройку

    // Имя точки доступа для настройки
    if (!wifiManager.autoConnect("NEXIS_Home_Setup")) {
        Serial.println("\nFailed to connect!");
        showStatusScreen("WiFi", "Failed! Restarting...");
        setLedColor(255, 0, 0);  // Красный - ошибка
        delay(3000);
        ESP.restart();
    }

    wifiConnected = true;
    Serial.println("\nConnected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    showStatusScreen("WiFi OK", WiFi.localIP().toString());
    setLedColor(0, 255, 0);  // Зелёный - успех
    delay(1000);
}

void initWebServer() {
    Serial.print("Starting web server... ");

    // Главная страница
    server.on("/", handleRoot);

    // API endpoints
    server.on("/api/data", handleApiData);
    server.on("/api/settings", HTTP_GET, handleGetSettings);
    server.on("/api/settings", HTTP_POST, handlePostSettings);
    server.on("/api/status", handleApiStatus);

    // Управление
    server.on("/reboot", handleReboot);
    server.on("/reset", handleReset);

    server.begin();
    Serial.println("OK");
}

void initOTA() {
    Serial.print("Initializing OTA... ");

    ArduinoOTA.setHostname("nexis-home-hub");
    ArduinoOTA.setPassword("nexis2026");

    ArduinoOTA.onStart([]() {
        Serial.println("\nOTA Update starting...");
        showStatusScreen("OTA", "Updating...");
    });

    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        int percent = (progress / (total / 100));
        Serial.printf("Progress: %u%%\r", percent);
    });

    ArduinoOTA.onEnd([]() {
        Serial.println("\nOTA Update complete!");
        showStatusScreen("OTA", "Complete!");
    });

    ArduinoOTA.begin();
    Serial.println("OK");
}

// ==================== ГЛАВНЫЙ ЦИКЛ ====================

void loop() {
    // Обработка OTA
    ArduinoOTA.handle();

    // Обработка веб-сервера
    server.handleClient();

    // Проверка кнопки
    checkButton();

    // Чтение датчиков каждые 2 секунды
    if (millis() - lastReadTime >= 2000) {
        readSensors();
        checkAlerts();
        lastReadTime = millis();
    }

    // Обновление дисплея каждую секунду
    if (millis() - lastDisplayUpdate >= 1000) {
        updateDisplay();
        lastDisplayUpdate = millis();
    }

    // Отправка данных на сервер
    if (millis() - lastSendTime >= (sendInterval * 1000)) {
        sendDataToNexis();
        lastSendTime = millis();
    }

    // Обновление uptime
    sensorData.uptime = millis() / 1000;
}

// ==================== ФУНКЦИИ ЧТЕНИЯ ДАТЧИКОВ ====================

void readSensors() {
    // DHT22 - температура и влажность
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(h) && !isnan(t)) {
        sensorData.temperature = t;
        sensorData.humidity = h;
    }

    // BMP280 - давление
    if (bmpOk) {
        sensorData.pressure = bmp.readPressure() / 100.0F;  // hPa
    }

    // BH1750 - освещённость
    if (lightMeterOk) {
        sensorData.light = lightMeter.readLightLevel();
    }

    // MQ-135 - качество воздуха (raw analog value)
    sensorData.airQuality = analogRead(MQ135_PIN);

    // PIR - движение
    bool motion = digitalRead(PIR_PIN);
    if (motion) {
        sensorData.motionDetected = true;
        sensorData.lastMotionTime = millis();
    } else if (millis() - sensorData.lastMotionTime > 5000) {
        sensorData.motionDetected = false;
    }

    // WiFi сигнал
    sensorData.wifiSignal = WiFi.RSSI();
}

// ==================== ФУНКЦИИ ДИСПЛЕЯ ====================

void showBootScreen() {
    if (!displayOk) return;

    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(20, 10);
    display.println("NEXIS");
    display.setTextSize(1);
    display.setCursor(25, 35);
    display.println("Home Sensor");
    display.setCursor(40, 50);
    display.println("v1.0.0");
    display.display();
    delay(2000);
}

void showStatusScreen(String title, String message) {
    if (!displayOk) return;

    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(title);
    display.setTextSize(1);
    display.setCursor(0, 30);
    display.println(message);
    display.display();
}

void updateDisplay() {
    if (!displayOk) return;

    display.clearDisplay();

    // Заголовок
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("NEXIS Home");

    // Время работы
    display.setCursor(80, 0);
    unsigned long hours = sensorData.uptime / 3600;
    unsigned long mins = (sensorData.uptime % 3600) / 60;
    display.printf("%02lu:%02lu", hours, mins);

    // WiFi индикатор
    display.setCursor(118, 0);
    if (WiFi.status() == WL_CONNECTED) {
        display.print("*");
    } else {
        display.print("!");
    }

    // Разделитель
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

    // Температура и влажность
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.printf("T: %.1fC", sensorData.temperature);
    display.setCursor(64, 14);
    display.printf("H: %.0f%%", sensorData.humidity);

    // Давление и освещённость
    display.setCursor(0, 26);
    display.printf("P: %.0fhPa", sensorData.pressure);
    display.setCursor(64, 26);
    display.printf("L: %.0flux", sensorData.light);

    // Качество воздуха
    display.setCursor(0, 38);
    display.print("Air: ");
    if (sensorData.airQuality < 400) {
        display.print("Good");
    } else if (sensorData.airQuality < 700) {
        display.print("Moderate");
    } else {
        display.print("Poor!");
    }
    display.printf(" (%d)", sensorData.airQuality);

    // Движение
    display.setCursor(0, 50);
    display.print("Motion: ");
    display.print(sensorData.motionDetected ? "YES" : "No");

    // WiFi сигнал
    display.setCursor(80, 50);
    display.printf("WiFi:%ddB", sensorData.wifiSignal);

    display.display();
}

// ==================== ФУНКЦИИ ОПОВЕЩЕНИЙ ====================

void checkAlerts() {
    bool alert = false;

    // Проверка температуры
    if (sensorData.temperature < thresholds.tempMin ||
        sensorData.temperature > thresholds.tempMax) {
        alert = true;
        setLedColor(255, 165, 0);  // Оранжевый
    }

    // Проверка влажности
    if (sensorData.humidity < thresholds.humidityMin ||
        sensorData.humidity > thresholds.humidityMax) {
        alert = true;
    }

    // Проверка качества воздуха
    if (sensorData.airQuality > thresholds.airQualityMax) {
        alert = true;
        setLedColor(255, 0, 0);  // Красный - плохой воздух
        playTone(2000, 200);
    }

    // Если всё нормально
    if (!alert) {
        setLedColor(0, 255, 0);  // Зелёный
    }
}

// ==================== ФУНКЦИИ СЕТИ ====================

void sendDataToNexis() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi not connected, skipping send");
        return;
    }

    Serial.print("Sending data to NEXIS... ");

    // Формируем JSON
    DynamicJsonDocument doc(1024);

    doc["device_id"] = deviceId;
    doc["device_type"] = "sensor_hub";
    doc["timestamp"] = millis();

    JsonObject location = doc.createNestedObject("location");
    location["room"] = roomName;
    location["building"] = "home";

    JsonObject sensors = doc.createNestedObject("sensors");

    JsonObject temp = sensors.createNestedObject("temperature");
    temp["value"] = sensorData.temperature;
    temp["unit"] = "celsius";

    JsonObject humidity = sensors.createNestedObject("humidity");
    humidity["value"] = sensorData.humidity;
    humidity["unit"] = "percent";

    JsonObject pressure = sensors.createNestedObject("pressure");
    pressure["value"] = sensorData.pressure;
    pressure["unit"] = "hPa";

    JsonObject air = sensors.createNestedObject("air_quality");
    air["value"] = sensorData.airQuality;
    air["unit"] = "ppm";
    air["status"] = sensorData.airQuality < 400 ? "good" :
                   (sensorData.airQuality < 700 ? "moderate" : "poor");

    JsonObject light = sensors.createNestedObject("light");
    light["value"] = sensorData.light;
    light["unit"] = "lux";

    JsonObject motion = sensors.createNestedObject("motion");
    motion["detected"] = sensorData.motionDetected;
    motion["last_detection"] = sensorData.lastMotionTime;

    JsonObject status = doc.createNestedObject("status");
    status["wifi_signal"] = sensorData.wifiSignal;
    status["uptime"] = sensorData.uptime;

    String jsonString;
    serializeJson(doc, jsonString);

    // Отправляем HTTP POST
    WiFiClient client;
    HTTPClient http;

    http.begin(client, nexisServer);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-ID", deviceId);

    int httpCode = http.POST(jsonString);

    if (httpCode > 0) {
        Serial.printf("OK (HTTP %d)\n", httpCode);
        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            Serial.println("Response: " + response);
        }
    } else {
        Serial.printf("FAILED: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
}

// ==================== ВЕБ-СЕРВЕР ====================

void handleRoot() {
    String html = R"rawliteral(
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEXIS Home Sensor Hub</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 30px; color: #00d4ff; }
        .card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 20px;
            backdrop-filter: blur(10px);
        }
        .card h2 { color: #00d4ff; margin-bottom: 15px; }
        .sensors-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
        }
        .sensor-box {
            background: rgba(0,212,255,0.1);
            border: 1px solid rgba(0,212,255,0.3);
            border-radius: 10px;
            padding: 15px;
            text-align: center;
        }
        .sensor-value { font-size: 24px; font-weight: bold; color: #00ff88; }
        .sensor-label { font-size: 12px; color: #aaa; margin-top: 5px; }
        .status-good { color: #00ff88; }
        .status-warning { color: #ffaa00; }
        .status-danger { color: #ff4444; }
        input, select {
            width: 100%;
            padding: 10px;
            margin: 5px 0 15px;
            border: 1px solid rgba(0,212,255,0.3);
            border-radius: 5px;
            background: rgba(0,0,0,0.3);
            color: #fff;
        }
        button {
            background: linear-gradient(135deg, #00d4ff, #0099cc);
            color: #fff;
            border: none;
            padding: 12px 25px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-right: 10px;
        }
        button:hover { opacity: 0.9; }
        button.danger { background: linear-gradient(135deg, #ff4444, #cc0000); }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏠 NEXIS Home Sensor Hub</h1>

        <div class="card">
            <h2>📊 Текущие показания</h2>
            <div class="sensors-grid">
                <div class="sensor-box">
                    <div class="sensor-value" id="temp">--</div>
                    <div class="sensor-label">🌡️ Температура</div>
                </div>
                <div class="sensor-box">
                    <div class="sensor-value" id="humidity">--</div>
                    <div class="sensor-label">💧 Влажность</div>
                </div>
                <div class="sensor-box">
                    <div class="sensor-value" id="pressure">--</div>
                    <div class="sensor-label">🌀 Давление</div>
                </div>
                <div class="sensor-box">
                    <div class="sensor-value" id="light">--</div>
                    <div class="sensor-label">🔆 Освещённость</div>
                </div>
                <div class="sensor-box">
                    <div class="sensor-value" id="air">--</div>
                    <div class="sensor-label">🌬️ Качество воздуха</div>
                </div>
                <div class="sensor-box">
                    <div class="sensor-value" id="motion">--</div>
                    <div class="sensor-label">👤 Движение</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>⚙️ Настройки</h2>
            <form id="settingsForm">
                <label>NEXIS Server URL:</label>
                <input type="text" id="serverUrl" value=")rawliteral" + nexisServer + R"rawliteral(">

                <label>Device ID:</label>
                <input type="text" id="deviceId" value=")rawliteral" + deviceId + R"rawliteral(">

                <label>Комната:</label>
                <input type="text" id="roomName" value=")rawliteral" + roomName + R"rawliteral(">

                <label>Интервал отправки (секунды):</label>
                <input type="number" id="interval" value=")rawliteral" + String(sendInterval) + R"rawliteral(" min="10" max="3600">

                <button type="submit">💾 Сохранить</button>
                <button type="button" class="danger" onclick="reboot()">🔄 Перезагрузить</button>
            </form>
        </div>

        <div class="card">
            <h2>📈 Статус</h2>
            <p>WiFi: <span id="wifi">--</span></p>
            <p>IP: )rawliteral" + WiFi.localIP().toString() + R"rawliteral(</p>
            <p>Uptime: <span id="uptime">--</span></p>
        </div>
    </div>

    <script>
        function updateData() {
            fetch('/api/data')
                .then(r => r.json())
                .then(d => {
                    document.getElementById('temp').textContent = d.temperature.toFixed(1) + '°C';
                    document.getElementById('humidity').textContent = d.humidity.toFixed(0) + '%';
                    document.getElementById('pressure').textContent = d.pressure.toFixed(0) + ' hPa';
                    document.getElementById('light').textContent = d.light.toFixed(0) + ' lx';
                    document.getElementById('air').textContent = d.airQuality + ' ppm';
                    document.getElementById('air').className = 'sensor-value ' +
                        (d.airQuality < 400 ? 'status-good' : d.airQuality < 700 ? 'status-warning' : 'status-danger');
                    document.getElementById('motion').textContent = d.motion ? 'Да' : 'Нет';
                    document.getElementById('wifi').textContent = d.wifiSignal + ' dBm';
                    document.getElementById('uptime').textContent = Math.floor(d.uptime/3600) + 'ч ' + Math.floor((d.uptime%3600)/60) + 'м';
                });
        }

        document.getElementById('settingsForm').onsubmit = function(e) {
            e.preventDefault();
            fetch('/api/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    server: document.getElementById('serverUrl').value,
                    deviceId: document.getElementById('deviceId').value,
                    room: document.getElementById('roomName').value,
                    interval: parseInt(document.getElementById('interval').value)
                })
            }).then(() => alert('Настройки сохранены!'));
        };

        function reboot() {
            if(confirm('Перезагрузить устройство?')) {
                fetch('/reboot').then(() => alert('Перезагрузка...'));
            }
        }

        updateData();
        setInterval(updateData, 2000);
    </script>
</body>
</html>
)rawliteral";

    server.send(200, "text/html", html);
}

void handleApiData() {
    DynamicJsonDocument doc(512);

    doc["temperature"] = sensorData.temperature;
    doc["humidity"] = sensorData.humidity;
    doc["pressure"] = sensorData.pressure;
    doc["light"] = sensorData.light;
    doc["airQuality"] = sensorData.airQuality;
    doc["motion"] = sensorData.motionDetected;
    doc["wifiSignal"] = sensorData.wifiSignal;
    doc["uptime"] = sensorData.uptime;

    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json);
}

void handleGetSettings() {
    DynamicJsonDocument doc(256);

    doc["server"] = nexisServer;
    doc["deviceId"] = deviceId;
    doc["room"] = roomName;
    doc["interval"] = sendInterval;

    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json);
}

void handlePostSettings() {
    if (server.hasArg("plain")) {
        DynamicJsonDocument doc(256);
        deserializeJson(doc, server.arg("plain"));

        nexisServer = doc["server"].as<String>();
        deviceId = doc["deviceId"].as<String>();
        roomName = doc["room"].as<String>();
        sendInterval = doc["interval"];

        saveSettings();

        server.send(200, "application/json", "{\"status\":\"ok\"}");
    }
}

void handleApiStatus() {
    DynamicJsonDocument doc(256);

    doc["wifi"] = WiFi.status() == WL_CONNECTED;
    doc["sensors"] = sensorsOk;
    doc["display"] = displayOk;
    doc["bmp"] = bmpOk;
    doc["light"] = lightMeterOk;
    doc["freeHeap"] = ESP.getFreeHeap();

    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json);
}

void handleReboot() {
    server.send(200, "text/plain", "Rebooting...");
    delay(500);
    ESP.restart();
}

void handleReset() {
    EEPROM.begin(512);
    for (int i = 0; i < 512; i++) {
        EEPROM.write(i, 0);
    }
    EEPROM.commit();
    server.send(200, "text/plain", "Settings reset. Rebooting...");
    delay(500);
    ESP.restart();
}

// ==================== EEPROM ====================

void saveSettings() {
    EEPROM.begin(512);

    DynamicJsonDocument doc(256);
    doc["server"] = nexisServer;
    doc["deviceId"] = deviceId;
    doc["room"] = roomName;
    doc["interval"] = sendInterval;

    String json;
    serializeJson(doc, json);

    for (int i = 0; i < json.length(); i++) {
        EEPROM.write(i, json[i]);
    }
    EEPROM.write(json.length(), '\0');
    EEPROM.commit();

    Serial.println("Settings saved to EEPROM");
}

void loadSettings() {
    EEPROM.begin(512);

    String json = "";
    char c;
    for (int i = 0; i < 256; i++) {
        c = EEPROM.read(i);
        if (c == '\0') break;
        json += c;
    }

    if (json.length() > 0) {
        DynamicJsonDocument doc(256);
        if (deserializeJson(doc, json) == DeserializationError::Ok) {
            nexisServer = doc["server"].as<String>();
            deviceId = doc["deviceId"].as<String>();
            roomName = doc["room"].as<String>();
            sendInterval = doc["interval"];
            Serial.println("Settings loaded from EEPROM");
        }
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

void checkButton() {
    static unsigned long lastPress = 0;

    if (digitalRead(BUTTON_PIN) == LOW) {
        if (millis() - lastPress > 300) {  // Debounce
            Serial.println("Button pressed - sending data now");
            sendDataToNexis();
            playTone(1500, 100);
            lastPress = millis();
        }
    }
}

void setLedColor(int r, int g, int b) {
    analogWrite(LED_R_PIN, r);
    analogWrite(LED_G_PIN, g);
    analogWrite(LED_B_PIN, b);
}

void playTone(int frequency, int duration) {
    tone(BUZZER_PIN, frequency, duration);
}

// ==================== КОНЕЦ ====================
