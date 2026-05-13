# TEST 14 — ESP32 встроенный веб-сервер (данные с датчиков в браузере)

**Назначение:** ESP32 сам раздаёт HTML-страницу и отвечает на `/api/sensors` — браузер показывает данные с датчиков без NEXIS сервера  
**Библиотеки:** WiFi.h, WebServer.h (встроены в ESP32 Arduino Core)

---

## Как работают main.cpp + config.h + data/ вместе

```
PlatformIO проект:
esp32/
├── platformio.ini          — настройки сборки
├── src/
│   ├── main.cpp            — ВЕСЬ код прошивки (C++)
│   └── config.h            — пины, пароли, пороги (через #include "config.h")
└── data/
    └── index.html          — файлы для SPIFFS (загружаются отдельно!)
```

**Важно:** `data/` сам по себе ничего не делает. Нужны два шага:

1. `pio run -t upload` — прошивка ESP32 (main.cpp)
2. `pio run -t uploadfs` — загрузка файлов в SPIFFS/LittleFS (data/)

Если сделать только шаг 1 — `SPIFFS.open("/index.html")` вернёт ошибку (файловая система пуста).  
Если сделать только шаг 2 — файлы лежат в SPIFFS, но прошивка не знает, как их раздавать.

**config.h** — просто заголовочный файл в той же папке `src/`. Когда компилятор обрабатывает `main.cpp`, директива `#include "config.h"` подставляет содержимое напрямую. Никакой магии — просто один большой файл в итоге.

---

## Версия 1 — PlatformIO (SPIFFS + index.html отдельным файлом)

Эта версия использует `esp32/data/index.html` как отдельный файл в SPIFFS.

### platformio.ini (добавить настройки)

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_speed = 921600
board_build.filesystem = spiffs
lib_deps =
    claws/BH1750 @ ^1.3.0
    marcoschwartz/LiquidCrystal_I2C @ ^1.1.4
```

### main.cpp (PlatformIO вариант)

```cpp
/*
 * NEXIS TEST 14 — ESP32 встроенный веб-сервер (PlatformIO + SPIFFS)
 *
 * Загрузка:
 *   1. pio run -t upload      (прошивка)
 *   2. pio run -t uploadfs    (загрузить data/index.html в SPIFFS)
 *
 * ← ИЗМЕНИТЬ: WiFi данные ниже
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <BH1750.h>

// ─── WiFi ───────────────────────────────────────
#define WIFI_SSID     "Testardu"   // ← ИЗМЕНИТЬ
#define WIFI_PASSWORD "12345678"   // ← ИЗМЕНИТЬ

// ─── Пины ───────────────────────────────────────
#define PIN_NOISE     39
#define PIN_PIR       27

// ─── Объекты ────────────────────────────────────
WebServer server(80);
BH1750    lightMeter;

// ─── Данные датчиков ────────────────────────────
struct SensorData {
  float light    = 0;
  float noise    = 0;
  bool  motion   = false;
  unsigned long timestamp = 0;
} sensors;

// ─────────────────────────────────────────────────
// Чтение датчиков
// ─────────────────────────────────────────────────
void readSensors() {
  // BH1750
  float lux = lightMeter.readLightLevel();
  if (lux >= 0) sensors.light = lux;

  // KY-037 (пик из 20 отсчётов)
  int peak = 0;
  for (int i = 0; i < 20; i++) {
    int v = analogRead(PIN_NOISE);
    if (v > peak) peak = v;
    delay(1);
  }
  sensors.noise = 30.0f + (peak / 4095.0f) * 60.0f;

  // PIR
  sensors.motion = digitalRead(PIN_PIR);
  sensors.timestamp = millis();
}

// ─────────────────────────────────────────────────
// API: GET /api/sensors  → JSON
// ─────────────────────────────────────────────────
void handleApiSensors() {
  readSensors();

  JsonDocument doc;
  doc["light"]     = round(sensors.light * 10) / 10.0;
  doc["noise"]     = round(sensors.noise * 10) / 10.0;
  doc["motion"]    = sensors.motion ? 1 : 0;
  doc["timestamp"] = sensors.timestamp;
  doc["uptime_s"]  = millis() / 1000;

  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

// ─────────────────────────────────────────────────
// Главная страница из SPIFFS
// ─────────────────────────────────────────────────
void handleRoot() {
  File f = SPIFFS.open("/index.html", "r");
  if (!f) {
    server.send(404, "text/plain",
      "index.html not found in SPIFFS.\n"
      "Run: pio run -t uploadfs");
    return;
  }
  server.streamFile(f, "text/html");
  f.close();
}

// ─────────────────────────────────────────────────
// CORS-заголовки (для локальных тестов)
// ─────────────────────────────────────────────────
void addCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST 14: ESP32 Веб-сервер (SPIFFS) ===");

  // SPIFFS
  if (!SPIFFS.begin(true)) {
    Serial.println("[SPIFFS] Ошибка инициализации!");
  } else {
    Serial.println("[SPIFFS] OK");
    File f = SPIFFS.open("/index.html", "r");
    if (f) {
      Serial.printf("[SPIFFS] index.html найден (%d байт)\n", f.size());
      f.close();
    } else {
      Serial.println("[SPIFFS] index.html НЕ найден — запусти: pio run -t uploadfs");
    }
  }

  // BH1750
  Wire.begin(21, 22);
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[BH1750] OK");
  } else {
    Serial.println("[BH1750] Не найден (I2C 0x23)");
  }

  // PIR
  pinMode(PIN_PIR, INPUT);
  analogSetAttenuation(ADC_11db);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] Подключение к %s ", WIFI_SSID);
  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
    delay(500); Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WiFi] OK — IP: " + WiFi.localIP().toString());
    Serial.println("Открой браузер: http://" + WiFi.localIP().toString());
  } else {
    Serial.println("[WiFi] ОШИБКА — дашборд не доступен по сети");
  }

  // Маршруты сервера
  server.on("/",            HTTP_GET, handleRoot);
  server.on("/index.html",  HTTP_GET, handleRoot);
  server.on("/api/sensors", HTTP_GET, []() {
    addCORS();
    handleApiSensors();
  });
  server.onNotFound([]() {
    server.send(404, "text/plain", "Not found");
  });

  server.begin();
  Serial.println("[HTTP] Сервер запущен на порту 80");
}

void loop() {
  server.handleClient();
  delay(5);
}
```

---

## Версия 2 — Arduino IDE (HTML встроен прямо в .ino)

В Arduino IDE нет `pio run -t uploadfs`. Два подхода:

**Подход A:** Установить плагин *ESP32 Sketch Data Upload* (Tools → ESP32 Sketch Data Upload) — работает как `uploadfs`, папка `data/` рядом со скетчем.

**Подход B (ниже):** Встроить HTML прямо в `.ino` как строку `PROGMEM`. Один файл — ничего дополнительно загружать не надо.

```cpp
/*
 * NEXIS TEST 14 — ESP32 веб-сервер (Arduino IDE, HTML встроен в код)
 *
 * Библиотеки: (Менеджер библиотек Arduino IDE)
 *   - BH1750 by Christopher Laws
 *   - ArduinoJson by Benoit Blanchon (v7)
 *   (WiFi.h и WebServer.h встроены в ESP32 Arduino Core)
 *
 * ← ИЗМЕНИТЬ: WiFi данные ниже
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <BH1750.h>

// ─── WiFi ───────────────────────────────────────
#define WIFI_SSID     "Testardu"   // ← ИЗМЕНИТЬ
#define WIFI_PASSWORD "12345678"   // ← ИЗМЕНИТЬ

// ─── Пины ───────────────────────────────────────
#define PIN_NOISE 39
#define PIN_PIR   27

// ─────────────────────────────────────────────────
// HTML страница в Flash памяти (PROGMEM)
// R"===( ... )===" — raw string literal, можно вставлять HTML как есть
// Используем DOM-методы вместо innerHTML (безопасно, нет XSS)
// ─────────────────────────────────────────────────
const char INDEX_HTML[] PROGMEM = R"===(
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXIS ESP32 Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1117;color:#e0e0e0;font-family:'Segoe UI',sans-serif;padding:16px}
  h1{text-align:center;margin-bottom:20px;font-size:1.3rem;color:#7ec8e3}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .tile{background:#1a1d2e;border-radius:12px;padding:16px;text-align:center;
        border:1px solid #2a2d3e;transition:border-color .3s}
  .tile.warn{border-color:#f59e0b}
  .tile.danger{border-color:#ef4444}
  .tile.ok{border-color:#22c55e}
  .tile-icon{font-size:2rem;margin-bottom:8px}
  .tile-label{font-size:0.75rem;color:#888;margin-bottom:4px}
  .tile-value{font-size:1.5rem;font-weight:bold}
  .tile-unit{font-size:0.75rem;color:#aaa;margin-left:2px}
  .tile-status{font-size:0.7rem;margin-top:6px;color:#aaa}
  #status{text-align:center;margin-top:16px;font-size:0.8rem;color:#555}
</style>
</head>
<body>
<h1>NEXIS Wellness Station</h1>
<div class="grid" id="grid"></div>
<div id="status">Загрузка...</div>

<script>
// Конфиг тайлов: id, иконка, метка, единица, пороги [warn, danger]
var TILES = [
  {id:'light',    icon:'☀️', label:'Освещённость', unit:'lux',  warnLo:150, dangerLo:50},
  {id:'noise',    icon:'🔊', label:'Шум',          unit:'dB',   warnHi:55,  dangerHi:70},
  {id:'motion',   icon:'👤', label:'Присутствие',  unit:'',     special:'motion'},
  {id:'uptime_s', icon:'⏱️', label:'Аптайм',       unit:'сек',  special:'uptime'}
];

// Строим тайлы через DOM (без innerHTML)
var grid = document.getElementById('grid');
var tileEls = {};

TILES.forEach(function(t) {
  var tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = 'tile-' + t.id;

  var icon = document.createElement('div');
  icon.className = 'tile-icon';
  icon.textContent = t.icon;

  var label = document.createElement('div');
  label.className = 'tile-label';
  label.textContent = t.label;

  var valRow = document.createElement('div');
  var valEl = document.createElement('span');
  valEl.className = 'tile-value';
  valEl.id = 'val-' + t.id;
  valEl.textContent = '—';

  var unitEl = document.createElement('span');
  unitEl.className = 'tile-unit';
  unitEl.textContent = t.unit;

  valRow.appendChild(valEl);
  valRow.appendChild(unitEl);

  var statusEl = document.createElement('div');
  statusEl.className = 'tile-status';
  statusEl.id = 'st-' + t.id;

  tile.appendChild(icon);
  tile.appendChild(label);
  tile.appendChild(valRow);
  tile.appendChild(statusEl);
  grid.appendChild(tile);

  tileEls[t.id] = {tile: tile, val: valEl, st: statusEl, cfg: t};
});

// Обновление данных из /api/sensors
function fetchData() {
  fetch('/api/sensors')
    .then(function(r){ return r.json(); })
    .then(function(d) {
      TILES.forEach(function(t) {
        var v = d[t.id];
        if (v === undefined) return;
        var el = tileEls[t.id];
        var cls = 'tile';

        if (t.special === 'motion') {
          el.val.textContent = v ? 'Да' : 'Нет';
          cls += v ? ' ok' : '';
          el.st.textContent = v ? 'Обнаружено движение' : 'Движения нет';
        } else if (t.special === 'uptime') {
          var h = Math.floor(v/3600), m = Math.floor((v%3600)/60), s = v%60;
          el.val.textContent = (h>0 ? h+'ч ' : '') + (m>0 ? m+'м ' : '') + s;
          el.st.textContent = 'С момента включения';
        } else {
          el.val.textContent = (typeof v === 'number') ? v.toFixed(1) : v;
          if (t.dangerHi && v >= t.dangerHi)      { cls += ' danger'; el.st.textContent = 'ОПАСНО'; }
          else if (t.warnHi && v >= t.warnHi)     { cls += ' warn';   el.st.textContent = 'Внимание'; }
          else if (t.dangerLo && v <= t.dangerLo) { cls += ' danger'; el.st.textContent = 'ОПАСНО низко'; }
          else if (t.warnLo && v <= t.warnLo)     { cls += ' warn';   el.st.textContent = 'Низко'; }
          else                                     { cls += ' ok';     el.st.textContent = 'Норма'; }
        }
        el.tile.className = cls;
      });
      var now = new Date().toLocaleTimeString('ru');
      document.getElementById('status').textContent = 'Обновлено: ' + now;
    })
    .catch(function(e){
      document.getElementById('status').textContent = 'Ошибка связи: ' + e.message;
    });
}

fetchData();
setInterval(fetchData, 5000);
</script>
</body>
</html>
)===";

// ─────────────────────────────────────────────────

WebServer server(80);
BH1750    lightMeter;

struct {
  float light  = 0;
  float noise  = 0;
  bool  motion = false;
} sens;

void readSensors() {
  float lux = lightMeter.readLightLevel();
  if (lux >= 0) sens.light = lux;

  int peak = 0;
  for (int i = 0; i < 20; i++) {
    int v = analogRead(PIN_NOISE);
    if (v > peak) peak = v;
    delay(1);
  }
  sens.noise  = 30.0f + (peak / 4095.0f) * 60.0f;
  sens.motion = digitalRead(PIN_PIR);
}

void handleRoot() {
  // Отправляем HTML из PROGMEM напрямую
  server.send_P(200, "text/html", INDEX_HTML);
}

void handleApiSensors() {
  readSensors();

  JsonDocument doc;
  doc["light"]     = round(sens.light * 10) / 10.0;
  doc["noise"]     = round(sens.noise * 10) / 10.0;
  doc["motion"]    = sens.motion ? 1 : 0;
  doc["uptime_s"]  = (int)(millis() / 1000);

  String json;
  serializeJson(doc, json);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST 14: ESP32 Веб-сервер (Arduino IDE) ===");
  Serial.printf("HTML в PROGMEM: %d байт\n", strlen_P(INDEX_HTML));

  // Датчики
  Wire.begin(21, 22);
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[BH1750] OK");
  } else {
    Serial.println("[BH1750] Не найден");
  }
  pinMode(PIN_PIR, INPUT);
  analogSetAttenuation(ADC_11db);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] Подключение к %s ", WIFI_SSID);
  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
    delay(500); Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WiFi] OK — IP: " + WiFi.localIP().toString());
    Serial.println("Открой браузер: http://" + WiFi.localIP().toString());
  } else {
    Serial.println("[WiFi] ОШИБКА!");
  }

  server.on("/",            HTTP_GET, handleRoot);
  server.on("/index.html",  HTTP_GET, handleRoot);
  server.on("/api/sensors", HTTP_GET, handleApiSensors);
  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });

  server.begin();
  Serial.println("[HTTP] Сервер запущен на порту 80");
}

void loop() {
  server.handleClient();
  delay(5);
}
```

---

## Как data/ + main.cpp работают в PlatformIO

```
Компиляция:                         Загрузка ФС:
pio run -t upload                   pio run -t uploadfs
         │                                    │
         ▼                                    ▼
  src/main.cpp → .bin        data/index.html → SPIFFS раздел
         │                                    │
         └──────── обе части в ESP32 ─────────┘
                         │
                    ESP32 загружается:
                    1. main.cpp: инит WiFi + WebServer
                    2. SPIFFS.open("/index.html") — берёт файл
                    3. server.streamFile(f) → браузер
```

**Порядок важен:** сначала `upload` (прошивка), потом `uploadfs` (файлы). Если загрузить в обратном порядке — `uploadfs` затрёт область прошивки или наоборот. PlatformIO сам разбивает Flash на разделы согласно partition table.

## Как config.h работает с main.cpp

```
src/
├── config.h   ← просто текстовый файл с #define
└── main.cpp   ← начинается с: #include "config.h"
```

Препроцессор C++ буквально вставляет содержимое `config.h` в начало `main.cpp` перед компиляцией. Итого компилятор видит один большой файл. Это стандартный C++ механизм — никакой магии PlatformIO здесь нет.

В Arduino IDE эквивалент: положить `config.h` в ту же папку, что и `.ino` файл — IDE автоматически добавит её к пути поиска заголовков.

## Arduino IDE: плагин vs PROGMEM

| Способ | Плюсы | Минусы |
|--------|-------|--------|
| **PROGMEM строка** (код выше) | Один `.ino` файл, ничего не нужно устанавливать | HTML сложно редактировать; нет горячей перезагрузки |
| **ESP32 Sketch Data Upload** | Редактируешь HTML отдельно | Нужно устанавливать плагин; каждый раз загружать FS отдельно |

Для курсовой работы рекомендуется **PROGMEM вариант** — проще воспроизвести на другом компьютере.

---

**Ожидаемый вывод Serial Monitor:**
```
=== NEXIS TEST 14: ESP32 Веб-сервер (Arduino IDE) ===
HTML в PROGMEM: 2847 байт
[BH1750] OK
[WiFi] Подключение к Testardu ........
[WiFi] OK — IP: 192.168.1.42
Открой браузер: http://192.168.1.42
[HTTP] Сервер запущен на порту 80
```

Открываешь браузер на ПК → `http://192.168.1.42` → видишь тайлы с данными датчиков, обновляются каждые 5 секунд.
