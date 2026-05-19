# NEXIS UNIFIED v3.0 — Полное объяснение кода

---

## 1. ОБЩАЯ АРХИТЕКТУРА

```
┌──────────────────────────────────────────────────────┐
│                     ESP32                            │
│                                                      │
│  Датчики → readXXX() → глобальные переменные         │
│       ↓                        ↓                     │
│  checkThresholds()        updateDisplay()            │
│       ↓                        ↓                     │
│  updateLED() / beep()      LCD 1602                  │
│       ↓                                              │
│  postSensorData() → POST /api/data → FastAPI :5000   │
│  webServer → GET /api/sensors → Браузер :80          │
└──────────────────────────────────────────────────────┘
```

Программа работает в бесконечном цикле `loop()`. Каждые 10 секунд читает датчики и отправляет данные на сервер. Каждые 3 секунды меняет страницу LCD. Постоянно обрабатывает веб-запросы и кнопки.

---

## 2. БИБЛИОТЕКИ

```cpp
#include <Wire.h>           // I2C шина — для BME280, BH1750, LCD
#include <WiFi.h>           // WiFi подключение ESP32
#include <HTTPClient.h>     // HTTP POST запросы на FastAPI сервер
#include <WebServer.h>      // Встроенный веб-сервер ESP32 на порту 80
#include <ArduinoJson.h>    // Сборка/разборка JSON (версия 7.x)
#include <Adafruit_Sensor.h>// Базовый класс для датчиков Adafruit
#include <Adafruit_BME280.h>// Датчик температуры/влажности/давления
#include <BH1750.h>         // Датчик освещённости
#include <LiquidCrystal_I2C.h> // LCD 1602 через I2C адаптер
```

---

## 3. НАСТРОЙКИ И КОНСТАНТЫ

### WiFi и сервер
```cpp
#define WIFI_SSID     "Testardu"       // Имя WiFi сети
#define WIFI_PASSWORD "12345678"       // Пароль
#define SERVER_HOST   "10.78.242.107"  // IP компьютера с FastAPI
#define SERVER_PORT   5000             // Порт FastAPI сервера
```

### Пины GPIO
```cpp
#define I2C_SDA    21   // I2C шина: данные  (BME280, BH1750, LCD)
#define I2C_SCL    22   // I2C шина: тактирование
#define ADDR_BME280 0x76 // I2C адрес BME280 (SDO → GND)
#define ADDR_BH1750 0x23 // I2C адрес BH1750 (ADDR → GND)
#define ADDR_LCD    0x27 // I2C адрес LCD адаптера

#define PIN_MQ135   36  // АЦП — аналоговый CO₂ (только вход)
#define PIN_PIR     27  // Цифровой — датчик движения
#define PIN_NOISE   39  // АЦП — микрофон KY-037 (только вход)
#define PIN_LED_R   13  // PWM — красный канал RGB LED
#define PIN_LED_G   12  // PWM — зелёный канал RGB LED
#define PIN_LED_B   14  // PWM — синий канал RGB LED
#define PIN_BUZZER  25  // PWM — зуммер (tone)
#define PIN_BTN_MODE 32 // Кнопка MODE — смена экрана LCD
#define PIN_BTN_OK   33 // Кнопка OK — старт/стоп Pomodoro
```

### Интервалы таймеров
```cpp
#define SENSOR_MS    10000  // Чтение датчиков каждые 10 сек
#define DISPLAY_MS   3000   // Смена страницы LCD каждые 3 сек
#define WIFI_CHECK_MS 15000 // Проверка WiFi каждые 15 сек
```

### Пороги алертов (по ГОСТ 30494-2011)
```cpp
#define THRESH_CO2_WARN    800   // CO₂ > 800 ppm  → жёлтый
#define THRESH_CO2_DANGER  1200  // CO₂ > 1200 ppm → красный
#define THRESH_TEMP_WARN   27.0  // T > 27°C → жёлтый
#define THRESH_TEMP_DANGER 30.0  // T > 30°C → красный
#define THRESH_HUM_WARN    65.0  // H > 65%  → жёлтый
#define THRESH_HUM_DANGER  75.0  // H > 75%  → красный
#define THRESH_LIGHT_WARN  150   // Свет < 150 lux → жёлтый
#define THRESH_LIGHT_DANGER 50   // Свет < 50 lux  → красный
#define THRESH_NOISE_WARN  55    // Шум > 55 дБ → жёлтый
#define THRESH_NOISE_DANGER 70   // Шум > 70 дБ → красный
```

---

## 4. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ

### Данные датчиков
```cpp
float sensorTemp      = NAN;  // Температура °C (BME280)
float sensorHum       = NAN;  // Влажность % (BME280)
float sensorPressure  = NAN;  // Давление hPa (BME280)
float sensorDewPoint  = NAN;  // Точка росы °C (вычисляется)
float sensorHeatIndex = NAN;  // Индекс жары °C (вычисляется при T≥27)
float sensorCO2       = NAN;  // CO₂ ppm (MQ-135, аналог)
float sensorLight     = NAN;  // Освещённость lux (BH1750)
float sensorNoise     = NAN;  // Шум дБ (KY-037)
bool  sensorMotion    = false; // Движение (PIR)
```

`NAN` (Not a Number) — специальное значение float. Означает «данных нет». Используется вместо -1 или 0, чтобы отличить «датчик не читается» от реального нулевого значения. Проверяется через `isnan(x)`.

### Состояние системы
```cpp
enum AlertLevel { ALERT_OK, ALERT_WARN, ALERT_DANGER };
AlertLevel alertLevel = ALERT_OK;  // Текущий уровень тревоги
String alertMessage = "";          // Текст тревоги

bool wifiConnected = false;        // Флаг подключения WiFi

enum PomoMode { POMO_IDLE, POMO_WORK, POMO_BREAK };
PomoMode pomoMode     = POMO_IDLE; // Режим Pomodoro
uint32_t pomoStartTime = 0;        // millis() момента старта
int pomoSecondsLeft   = 0;         // Секунд до конца этапа
int pomoCycles        = 0;         // Счётчик завершённых циклов

uint8_t displayPage = 0;           // Текущая страница LCD (0–5)
```

### Таймеры (millis-based)
```cpp
uint32_t lastSensorRead    = 0;  // Когда последний раз читали датчики
uint32_t lastDisplayChange = 0;  // Когда последний раз меняли экран
uint32_t lastWifiCheck     = 0;  // Когда последний раз проверяли WiFi
```

---

## 5. ПРЕРЫВАНИЯ (ISR) — ГЛАВНАЯ ТЕМА

### Что такое прерывание?

Обычный код выполняется строчка за строчкой. Если программа занята (читает датчик, ждёт ответа сервера), она не может одновременно следить за кнопкой.

**Прерывание (Interrupt)** — это аппаратный механизм: при изменении сигнала на пине процессор немедленно прерывает текущую работу, выполняет специальную функцию (ISR — Interrupt Service Routine), и возвращается обратно. Происходит мгновенно, независимо от того, что делает основная программа.

```
Основная программа:           Прерывание:
─────────────────────         ──────────────
readBME280()         ←──┐
...                      │    Нажата кнопка!
postSensorData()     ────┘──→ onBtnMode() { isrBtnMode = true; }
...                           ↑
                              └── возврат к postSensorData()
```

### Объявление флагов
```cpp
volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;
volatile bool isrPIR     = false;
```

`volatile` — ключевое слово, которое говорит компилятору: «эта переменная может измениться в любой момент извне (из ISR), не кешируй её». Без `volatile` компилятор мог бы оптимизировать код и не замечать изменений.

### Функции-обработчики прерываний
```cpp
void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }
void IRAM_ATTR onPIR()     { isrPIR     = true; }
```

`IRAM_ATTR` — атрибут ESP32. Размещает функцию в IRAM (Internal RAM) вместо Flash-памяти. Flash работает медленнее и может быть занята другими операциями (WiFi, запись). ISR должна выполняться мгновенно — поэтому IRAM обязателен.

Правило ISR: функция должна быть максимально короткой. Нельзя использовать `Serial.print`, `delay`, `millis`. Только устанавливаем флаг `= true`.

### Регистрация прерываний в setup()
```cpp
attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);
```

- `digitalPinToInterrupt(pin)` — преобразует номер GPIO в номер прерывания
- `FALLING` — срабатывает при переходе сигнала с HIGH → LOW (нажатие кнопки с INPUT_PULLUP)
- `RISING` — срабатывает при переходе LOW → HIGH (PIR обнаружил движение)

### Обработка флагов в handleButtons()
```cpp
void handleButtons() {
  uint32_t now = millis();

  if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) {
    isrBtnMode = false;          // Сбрасываем флаг
    btnModeLast = now;           // Запоминаем время
    displayPage = (displayPage + 1) % DISPLAY_PAGES;  // Следующая страница
    updateDisplay();
    beepOK();
  }

  if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) {
    isrBtnOK = false;
    btnOKLast = now;
    if (pomoMode == POMO_IDLE) pomoStart(); else pomoStop();
  }
}
```

**Дебаунс (debounce)** — защита от дребезга контактов. При нажатии кнопки сигнал не сразу стабилизируется, а несколько миллисекунд «скачет». Без дебаунса одно нажатие регистрируется как 5–20. Дебаунс через `millis()`: игнорируем повторные нажатия в течение 200 мс.

### Полный путь события кнопки
```
Физическое нажатие → GPIO32 падает LOW
       ↓
FALLING прерывание → onBtnMode() → isrBtnMode = true
       ↓
loop() → handleButtons() проверяет isrBtnMode
       ↓
Если прошло > 200ms → displayPage++ → updateDisplay()
```

---

## 6. ЧТЕНИЕ ДАТЧИКОВ

### BME280 — температура, влажность, давление (I2C)
```cpp
void readBME280() {
  bme.takeForcedMeasurement();          // Разбудить датчик, сделать замер, уснуть
  float t = bme.readTemperature();      // °C
  float h = bme.readHumidity();         // %
  float p = bme.readPressure() / 100.0f; // Па → гПа

  // Санитарная проверка — отсекаем физически невозможные значения
  sensorTemp     = (t < -40 || t > 85)   ? NAN : t;
  sensorHum      = (h < 0   || h > 100)  ? NAN : h;
  sensorPressure = (p < 870 || p > 1085) ? NAN : p;
```

**MODE_FORCED** — датчик спит между замерами (экономия энергии). `takeForcedMeasurement()` будит его, ждёт завершения замера, затем датчик снова засыпает.

**Точка росы** (формула Магнуса):
```cpp
float a = 17.27f, b = 237.7f;
float alpha = (a * T) / (b + T) + ln(H/100);
dewPoint = (b * alpha) / (a - alpha);
```
Температура, при которой воздух насыщается водяным паром. Если поверхность холоднее точки росы — появляется конденсат.

**Индекс жары (Heat Index)** — ощущаемая температура с учётом влажности. Рассчитывается только при T ≥ 27°C по формуле NOAA (полином 8-й степени от T и H).

### MQ-135 — CO₂ аналоговый (ADC)
```cpp
void readMQ135() {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(PIN_MQ135);
    delay(5);
  }
  sensorCO2 = (float)map(sum / 10, 0, 4095, 400, 2000);
}
```

- ESP32 АЦП: 12 бит → значения 0–4095
- 10 замеров с усреднением → уменьшение шума ADC
- `map(value, 0, 4095, 400, 2000)` — линейное отображение ADC в ppm CO₂
- 400 ppm — минимум (чистый воздух на улице), 2000 ppm — максимум
- **Важно:** MQ-135 требует 24–48 часов прогрева для стабильных показаний

### BH1750 — освещённость (I2C)
```cpp
void readBH1750() {
  float lux = lightMeter.readLightLevel();
  if (lux >= 0) sensorLight = lux;
}
```

Диапазон: 1–65535 lux. Работает в режиме `CONTINUOUS_HIGH_RES_MODE` — постоянные замеры с разрешением 1 lux.

### KY-037 — шум (ADC)
```cpp
void readNoise() {
  int peak = 0;
  for (int i = 0; i < 20; i++) {
    int v = analogRead(PIN_NOISE);
    if (v > peak) peak = v;  // Берём максимальный пик за 20 замеров
    delay(2);
  }
  // Линейная аппроксимация: ADC 0–4095 → 30–90 дБ
  sensorNoise = 30.0f + (peak / 4095.0f) * (90.0f - 30.0f);
}
```

Пиковый детектор: за 40 мс (20 × 2мс) фиксируем максимальную амплитуду звука. Это лучше среднего значения, т.к. звук — переменный сигнал вокруг нуля.

### PIR HC-SR501 — движение (Digital + ISR)
```cpp
void readPIR() {
  if (isrPIR) {
    sensorMotion = true;   // Прерывание зафиксировало движение
    isrPIR = false;        // Сброс флага
  } else {
    sensorMotion = (digitalRead(PIN_PIR) == HIGH);  // Читаем прямо
  }
}
```

PIR использует два механизма: прерывание (мгновенная реакция) и прямое чтение (для текущего состояния). Если PIR всё ещё держит HIGH — движение продолжается.

---

## 7. ВЫЧИСЛЕНИЕ WELLNESS INDEX

```cpp
int computeWellness() {
  int score = 0, cnt = 0;

  // Вес каждого параметра (в сумме 100):
  // CO₂  — 30%, Температура — 25%, Влажность — 20%
  // Свет — 15%, Шум         — 10%

  if (!isnan(sensorCO2)) {
    // При 400 ppm → 1.0 (100%), при 1600 ppm → 0.0 (0%)
    score += (int)(max(0.0f, 1.0f - (sensorCO2 - 400) / 1200.0f) * 100) * 30;
    cnt += 30;
  }
  if (!isnan(sensorTemp)) {
    // Оптимум 22°C, отклонение на 8°C → 0%
    score += (int)(max(0.0f, 1.0f - abs(sensorTemp - 22.0f) / 8.0f) * 100) * 25;
    cnt += 25;
  }
  // ... аналогично влажность, свет, шум

  return cnt > 0 ? score / cnt : 50;
}
```

Итог: 0–100. ≥75 = хорошо (зелёный), 45–74 = средне (жёлтый), <45 = плохо (красный).

---

## 8. СИСТЕМА АЛЕРТОВ

```cpp
AlertLevel checkThresholds() {
  AlertLevel lvl = ALERT_OK;
  alertMessage = "";

  auto upd = [&](AlertLevel nl, const char *msg) {
    if (nl > lvl) { lvl = nl; alertMessage = msg; }
    else if (nl == lvl && alertMessage.isEmpty()) alertMessage = msg;
  };

  // Проверка каждого параметра...
  return lvl;
}
```

`auto upd = [&](...)` — это лямбда-функция (анонимная функция внутри функции). `[&]` означает захват переменных `lvl` и `alertMessage` по ссылке. Используется вместо отдельной функции для краткости.

**Приоритет:** DANGER > WARN > OK. Если несколько параметров нарушены — сохраняется наивысший уровень.

---

## 9. RGB LED

```cpp
void setLED(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_LED_R, r);  // 0–255, PWM сигнал
  analogWrite(PIN_LED_G, g);
  analogWrite(PIN_LED_B, b);
}

void updateLED() {
  if (!wifiConnected) {
    bool blink = (millis() / 500) % 2;       // Мигание: 0/1 каждые 500мс
    setLED(0, 0, blink ? 200 : 0);            // Синий мигает
    return;
  }
  if (pomoMode == POMO_BREAK) { setLED(0, 0, 100); return; }   // Тёмно-синий
  if (pomoMode == POMO_WORK)  { setLED(0, 150, 50); return; }  // Бирюзовый
  switch (alertLevel) {
    case ALERT_OK:     setLED(0, 200, 0);   break;  // Зелёный
    case ALERT_WARN:   setLED(200, 150, 0); break;  // Жёлтый
    case ALERT_DANGER: setLED(255, 0, 0);   break;  // Красный
  }
}
```

`(millis() / 500) % 2` — трюк для мигания без `delay`. `millis()` всегда растёт. Делим на 500 → получаем целое число, меняющееся каждые 500мс. `% 2` → чередуется 0 и 1.

---

## 10. LCD ДИСПЛЕЙ

### lcdRow — вывод строки с форматированием
```cpp
void lcdRow(uint8_t row, const char *fmt, ...) {
  char buf[17] = {};                        // Буфер 16 символов + '\0'
  va_list args; va_start(args, fmt);
  vsnprintf(buf, 17, fmt, args); va_end(args); // printf в буфер
  for (int i = strlen(buf); i < 16; i++) buf[i] = ' '; // Дополнить пробелами
  lcd.setCursor(0, row); lcd.print(buf);
}
```

`...` и `va_list` — variadic arguments, переменное число аргументов (как у printf). `vsnprintf` — безопасный sprintf с ограничением длины. Пробелы в конце нужны чтобы затирать предыдущие символы при обновлении.

### 6 страниц LCD

| # | Содержимое |
|---|-----------|
| 0 | Температура + влажность + интерпретация |
| 1 | Давление + точка росы |
| 2 | CO₂ + качество воздуха |
| 3 | Освещённость + шум |
| 4 | Движение + Wellness + IP адрес |
| 5 | Pomodoro таймер |

---

## 11. ESP32 WEBSERVER

```cpp
void setupWebServer() {
  // Маршрут "/" → отдать HTML страницу из Flash
  webServer.on("/", HTTP_GET, []() {
    webServer.send_P(200, "text/html", INDEX_HTML);
  });

  // Маршрут "/api/sensors" → отдать JSON с данными датчиков
  webServer.on("/api/sensors", HTTP_GET, []() {
    JsonDocument doc;
    // Заполняем поля только если данные есть (не NAN)
    if (!isnan(sensorTemp)) doc["temperature"] = round(sensorTemp * 100) / 100.0;
    // ...
    doc["wellness"] = computeWellness();
    doc["uptime_s"] = (int)(millis() / 1000);

    String json; serializeJson(doc, json);
    webServer.sendHeader("Access-Control-Allow-Origin", "*"); // CORS
    webServer.send(200, "application/json", json);
  });

  webServer.begin();
}
```

**PROGMEM** — HTML страница хранится в Flash-памяти (не в RAM). ESP32 имеет 520 КБ RAM и 4 МБ Flash. `send_P` читает данные прямо из Flash, не загружая в RAM.

В `loop()` обязательно вызывается:
```cpp
if (wifiConnected) webServer.handleClient();
```
Это обрабатывает входящие HTTP запросы. Без этого вызова сервер не отвечает.

---

## 12. HTTP POST НА FASTAPI

```cpp
bool postSensorData() {
  if (!wifiConnected) return false;

  HTTPClient http;
  http.begin(API_DATA_URL);                           // http://IP:5000/api/data
  http.addHeader("Content-Type", "application/json"); // Заголовок типа данных
  http.setTimeout(5000);                              // Таймаут 5 секунд

  JsonDocument doc;
  if (!isnan(sensorTemp)) doc["temperature"] = round(sensorTemp * 10) / 10.0;
  // ... остальные поля

  String body;
  serializeJson(doc, body);  // Объект → JSON строка
  int code = http.POST(body);
  http.end();

  return (code == 200);
}
```

Данные отправляются каждые 10 секунд. Сервер сохраняет их в SQLite и рассылает через WebSocket браузерам. Telegram-бот читает данные с сервера и отправляет алерты.

---

## 13. POMODORO ТАЙМЕР

Техника Pomodoro: 25 минут работы → 5 минут перерыва → повтор.

```
POMO_IDLE → (нажать OK) → POMO_WORK → (25 мин) → POMO_BREAK → (5 мин) → POMO_IDLE
                                           ↑                                    |
                                           └──── (нажать OK в любой момент) ───┘
```

```cpp
void updatePomodoro() {
  if (pomoMode == POMO_IDLE) return;

  uint32_t el = (millis() - pomoStartTime) / 1000; // Секунд прошло

  if (pomoMode == POMO_WORK) {
    int left = 25 * 60 - (int)el;          // Секунд осталось
    pomoSecondsLeft = max(0, left);
    if (left <= 0) {                        // Время вышло
      pomoCycles++;
      postPomodoroEvent("work", 25);        // Отправить событие на сервер
      beepPomoDone();
      // Автоматически переходим на перерыв
      pomoMode = POMO_BREAK;
      pomoStartTime = millis();
    }
  }
  // Аналогично для POMO_BREAK...
}
```

---

## 14. LOOP — ГЛАВНЫЙ ЦИКЛ

```cpp
void loop() {
  uint32_t now = millis();

  // ① Веб-сервер — обрабатываем HTTP запросы (каждую итерацию!)
  if (wifiConnected) webServer.handleClient();

  // ② Датчики + POST — каждые 10 секунд
  if (now - lastSensorRead >= 10000) {
    lastSensorRead = now;
    readBME280(); readBH1750(); readMQ135(); readNoise(); readPIR();
    alertLevel = checkThresholds();
    updateLED();
    printDetailedSensors();
    postSensorData();
  }

  // ③ LCD — смена страницы каждые 3 секунды
  if (now - lastDisplayChange >= 3000) {
    lastDisplayChange = now;
    displayPage = (displayPage + 1) % 6;
    updateDisplay();
  }

  // ④ Pomodoro таймер (проверяем каждую итерацию)
  updatePomodoro();

  // ⑤ Кнопки (ISR флаги)
  handleButtons();

  // ⑥ WiFi watchdog — каждые 15 секунд
  if (now - lastWifiCheck >= 15000) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      WiFi.reconnect();
      // Ждём до 8 секунд
    }
  }

  delay(5); // 5мс пауза — даём ESP32 обработать фоновые задачи WiFi
}
```

**Паттерн millis-таймер** — вместо `delay(10000)` (которая блокирует всё) используем разницу времени. `now - lastSensorRead >= 10000` означает «прошло ли 10 секунд с последнего чтения». Программа не останавливается — просто пропускает действие, если время ещё не пришло.

---

## 15. SETUP — ИНИЦИАЛИЗАЦИЯ

```
Serial → Пины (pinMode) → ISR (attachInterrupt) → ADC настройка
      → I2C + LCD → BME280 → BH1750 → WiFi + WebServer
      → Первое чтение датчиков → Первый вывод на LCD
```

Каждый шаг выводит статус в Serial Monitor и на LCD. При ошибке датчика — сообщение и продолжение (не зависает).

---

## 16. ПОТОК ДАННЫХ (ИТОГ)

```
Физический мир
      ↓
Датчики (I2C / ADC / Digital)
      ↓
readXXX() → sensorXXX переменные
      ↓
checkThresholds() → alertLevel
      ↓
    ┌─────────────────────────────────────┐
    ↓           ↓           ↓            ↓
updateLED()  updateDisplay()  postSensorData()  webServer
(мгновенно) (каждые 3с)    (каждые 10с)    (по запросу)
    ↓           ↓           ↓            ↓
RGB LED      LCD 1602    FastAPI :5000   Браузер :80
                              ↓
                        SQLite + WebSocket
                              ↓
                        Браузер SPA :5000
                         + Telegram бот
```
