# TEST 13 — HTTP POST/GET к NEXIS серверу

**Назначение:** Проверить связь ESP32 с запущенным FastAPI сервером  
**Требует:** Запущенный NEXIS сервер (`uvicorn main:socket_app --port 5000`)  
**Библиотеки:** WiFi.h, HTTPClient.h, ArduinoJson

**Что проверяет:**
- GET `/api/status` — сервер доступен?
- POST `/api/data` — ESP32 отправляет тестовые данные
- GET `/api/sensors` — сервер вернул последние данные?
- POST `/api/pomodoro` — логирование Pomodoro события

---

```cpp
/*
 * NEXIS TEST — HTTP POST/GET к серверу
 * Проверка связи ESP32 → FastAPI NEXIS сервер
 *
 * Перед запуском:
 * 1. Запустить сервер: uvicorn main:socket_app --host 0.0.0.0 --port 5000
 * 2. Изменить WIFI_SSID, WIFI_PASSWORD, SERVER_HOST ниже
 *
 * ← ИЗМЕНИТЬ: Введи свои данные ↓
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define WIFI_SSID     "Testardu"        // ← ИЗМЕНИТЬ
#define WIFI_PASSWORD "12345678"        // ← ИЗМЕНИТЬ
#define SERVER_HOST   "10.78.242.107"   // ← ИЗМЕНИТЬ: IP вашего ПК (ipconfig)
#define SERVER_PORT   5000

String baseURL = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT);

// ─────────────────────────────────────────
// Проверка доступности сервера GET /api/status
// ─────────────────────────────────────────
bool checkServerStatus() {
  Serial.println("\n[TEST 1] GET /api/status");
  Serial.println("Проверка доступности сервера...");

  HTTPClient http;
  http.begin(baseURL + "/api/status");
  http.setTimeout(5000);

  int code = http.GET();
  String body = http.getString();
  http.end();

  Serial.printf("  HTTP код: %d\n", code);

  if (code == 200) {
    Serial.println("  Статус: ОК — сервер работает!");

    // Парсим ответ
    JsonDocument doc;
    if (deserializeJson(doc, body) == DeserializationError::Ok) {
      Serial.printf("  Версия сервера: %s\n",
                    doc["version"].as<const char*>() ? doc["version"].as<const char*>() : "—");
      Serial.printf("  Статус:         %s\n",
                    doc["status"].as<const char*>() ? doc["status"].as<const char*>() : "—");
    }
    return true;
  } else {
    Serial.printf("  ОШИБКА! Код %d — сервер не отвечает\n", code);
    Serial.println("  Проверь: запущен ли uvicorn? Верный ли SERVER_HOST?");
    return false;
  }
}

// ─────────────────────────────────────────
// Отправка тестовых данных POST /api/data
// ─────────────────────────────────────────
bool postTestData() {
  Serial.println("\n[TEST 2] POST /api/data");
  Serial.println("Отправка тестовых данных датчиков...");

  HTTPClient http;
  http.begin(baseURL + "/api/data");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Формируем тестовый JSON (имитация показаний датчиков)
  JsonDocument doc;
  doc["temperature"] = 23.5;
  doc["humidity"]    = 48.0;
  doc["pressure"]    = 1013.2;
  doc["light"]       = 350.0;
  doc["noise"]       = 42.5;
  doc["motion"]      = 1;
  // co2 — опционально (если есть MQ-135 или ZM106)
  // doc["co2"] = 650;

  String body;
  serializeJson(doc, body);

  Serial.println("  Отправляем JSON: " + body);

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.printf("  HTTP код: %d\n", code);

  if (code == 200) {
    Serial.println("  Статус: ОК — данные приняты сервером!");
    Serial.println("  Ответ: " + resp);
    return true;
  } else {
    Serial.printf("  ОШИБКА: %d\n", code);
    Serial.println("  Ответ: " + resp);
    return false;
  }
}

// ─────────────────────────────────────────
// Получение последних данных GET /api/sensors
// ─────────────────────────────────────────
bool getSensors() {
  Serial.println("\n[TEST 3] GET /api/sensors");
  Serial.println("Получение последних данных с сервера...");

  HTTPClient http;
  http.begin(baseURL + "/api/sensors");
  http.setTimeout(5000);

  int code = http.GET();
  String body = http.getString();
  http.end();

  Serial.printf("  HTTP код: %d\n", code);

  if (code == 200) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);

    if (err) {
      Serial.println("  Ошибка парсинга JSON: " + String(err.c_str()));
      return false;
    }

    Serial.println("  Данные с сервера:");
    if (doc.containsKey("temperature"))
      Serial.printf("    Температура: %.1f °C\n", doc["temperature"].as<float>());
    if (doc.containsKey("humidity"))
      Serial.printf("    Влажность:   %.1f %%\n", doc["humidity"].as<float>());
    if (doc.containsKey("pressure"))
      Serial.printf("    Давление:    %.1f hPa\n", doc["pressure"].as<float>());
    if (doc.containsKey("light"))
      Serial.printf("    Освещённость:%.0f lux\n", doc["light"].as<float>());
    if (doc.containsKey("noise"))
      Serial.printf("    Шум:         %.1f dB\n", doc["noise"].as<float>());
    if (doc.containsKey("motion"))
      Serial.printf("    Движение:    %s\n", doc["motion"].as<int>() ? "Да" : "Нет");
    if (doc.containsKey("timestamp"))
      Serial.printf("    Время:       %s\n", doc["timestamp"].as<const char*>());

    return true;
  } else if (code == 404 || body.contains("null") || body == "null") {
    Serial.println("  Данных ещё нет (сначала выполни TEST 2 — POST /api/data)");
    return false;
  } else {
    Serial.printf("  ОШИБКА: %d\n", code);
    return false;
  }
}

// ─────────────────────────────────────────
// Отправка Pomodoro события POST /api/pomodoro
// ─────────────────────────────────────────
bool postPomodoro() {
  Serial.println("\n[TEST 4] POST /api/pomodoro");
  Serial.println("Логирование тестового Pomodoro события...");

  HTTPClient http;
  http.begin(baseURL + "/api/pomodoro");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  JsonDocument doc;
  doc["type"]     = "work";   // "work" или "break"
  doc["duration"] = 25;       // минуты

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  Serial.printf("  HTTP код: %d\n", code);
  if (code == 200) {
    Serial.println("  Статус: ОК — Pomodoro событие записано!");
    return true;
  }
  Serial.printf("  ОШИБКА: %d\n", code);
  return false;
}

// ─────────────────────────────────────────
// Получение истории GET /api/history?hours=1
// ─────────────────────────────────────────
void getHistory() {
  Serial.println("\n[TEST 5] GET /api/history?hours=1");

  HTTPClient http;
  http.begin(baseURL + "/api/history?hours=1");
  http.setTimeout(5000);

  int code = http.GET();
  String body = http.getString();
  http.end();

  Serial.printf("  HTTP код: %d\n", code);
  if (code == 200) {
    // Считаем количество записей (грубо — по количеству "timestamp")
    int count = 0;
    int idx = 0;
    while ((idx = body.indexOf("timestamp", idx + 1)) != -1) count++;
    Serial.printf("  Записей за последний час: ~%d\n", count);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: HTTP сервер ===");
  Serial.printf("Сервер: http://%s:%d\n", SERVER_HOST, SERVER_PORT);
  Serial.println("─────────────────────────────────");

  // Подключаем WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] Подключение к %s ", WIFI_SSID);

  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
    delay(500); Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] ОШИБКА подключения! Проверь SSID/пароль.");
    return;
  }
  Serial.println("[WiFi] OK — IP: " + WiFi.localIP().toString());
  Serial.println("─────────────────────────────────");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Нет подключения!");
    delay(5000);
    return;
  }

  Serial.println("\n╔══════════════════════════════╗");
  Serial.println("║   ПОЛНЫЙ ТЕСТ NEXIS СЕРВЕРА  ║");
  Serial.println("╚══════════════════════════════╝");

  bool s1 = checkServerStatus();
  delay(500);

  if (s1) {
    bool s2 = postTestData();
    delay(500);
    bool s3 = getSensors();
    delay(500);
    bool s4 = postPomodoro();
    delay(500);
    getHistory();

    Serial.println("\n─────────────────────────────────");
    Serial.println("ИТОГО:");
    Serial.printf("  GET  /api/status:   %s\n", s1 ? "✓ ОК" : "✗ ОШИБКА");
    Serial.printf("  POST /api/data:     %s\n", s2 ? "✓ ОК" : "✗ ОШИБКА");
    Serial.printf("  GET  /api/sensors:  %s\n", s3 ? "✓ ОК" : "✗ ОШИБКА");
    Serial.printf("  POST /api/pomodoro: %s\n", s4 ? "✓ ОК" : "✗ ОШИБКА");

    if (s1 && s2 && s3) {
      Serial.println("\n✓ Связь ESP32 ↔ NEXIS сервер РАБОТАЕТ!");
      Serial.println("  Открой браузер: http://" + String(SERVER_HOST) + ":5000");
    }
  } else {
    Serial.println("\nСервер недоступен. Запусти:");
    Serial.println("  cd site/nexis-dashboard-v2/nexis-v2");
    Serial.println("  uvicorn main:socket_app --host 0.0.0.0 --port 5000");
  }

  Serial.println("\n─── Следующая проверка через 30 сек ───");
  delay(30000);
}
```

---

**Ожидаемый вывод (всё работает):**
```
=== NEXIS TEST: HTTP сервер ===
Сервер: http://10.78.242.107:5000

[TEST 1] GET /api/status
  HTTP код: 200
  Статус: ОК — сервер работает!

[TEST 2] POST /api/data
  Отправляем JSON: {"temperature":23.5,"humidity":48.0,...}
  HTTP код: 200
  Статус: ОК — данные приняты сервером!

[TEST 3] GET /api/sensors
  HTTP код: 200
  Данные с сервера:
    Температура: 23.5 °C
    Влажность:   48.0 %

ИТОГО:
  GET  /api/status:   ✓ ОК
  POST /api/data:     ✓ ОК
  GET  /api/sensors:  ✓ ОК
  POST /api/pomodoro: ✓ ОК

✓ Связь ESP32 ↔ NEXIS сервер РАБОТАЕТ!
```

**Если ошибка подключения:**
1. Запущен ли сервер? `uvicorn main:socket_app --host 0.0.0.0 --port 5000`
2. Верный ли `SERVER_HOST`? Узнать IP ПК: `cmd → ipconfig → IPv4 Address`
3. Одна ли WiFi сеть у ПК и ESP32?
4. Не блокирует ли фаервол порт 5000? (`--host 0.0.0.0` обязателен!)
