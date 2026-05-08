#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>

// Настройки пинов (проверь соответствие со своей сборкой)
#define PIR_PIN 13      // Датчик движения
#define SOUND_DIG 12    // Цифровой выход звука (D0)
#define SOUND_ANA 32    // Аналоговый выход звука (A0)

// Инициализация устройств
LiquidCrystal_I2C lcd(0x27, 20, 4); // Адрес 0x27, дисплей 20x4
Adafruit_BME280 bme;               // Климат
BH1750 lightMeter;                 // Свет

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // SDA на 21, SCL на 22

  // Инициализация LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("System Starting...");

  // Инициализация BME280
  if (!bme.begin(0x76)) {
    Serial.println("Ошибка BME280! Проверь адрес 0x76/0x77");
    lcd.setCursor(0, 1);
    lcd.print("BME280 Error");
  }

  // Инициализация BH1750
  if (!lightMeter.begin()) {
    Serial.println("Ошибка BH1750!");
    lcd.setCursor(0, 2);
    lcd.print("BH1750 Error");
  }

  pinMode(PIR_PIN, INPUT);
  pinMode(SOUND_DIG, INPUT);
  
  delay(2000);
  lcd.clear();
}

void loop() {
  // 1. Читаем датчики
  float temp = bme.readTemperature();
  float hum = bme.readHumidity();
  float lux = lightMeter.readLightLevel();
  bool motion = digitalRead(PIR_PIN);
  int soundLevel = analogRead(SOUND_ANA);
  bool soundDetected = !digitalRead(SOUND_DIG); // D0 обычно инвертирован (LOW при шуме)

  // 2. Вывод в Serial (для отладки)
  Serial.printf("T:%.1fC | H:%.1f%% | Lux:%.1f | Motion:%d | Sound:%d\n", 
                temp, hum, lux, motion, soundLevel);

  // 3. Вывод на LCD
  lcd.setCursor(0, 0);
  lcd.print("Temp: "); lcd.print(temp, 1); lcd.print(" C  ");
  
  lcd.setCursor(0, 1);
  lcd.print("Hum:  "); lcd.print(hum, 1); lcd.print(" %  ");
  
  lcd.setCursor(0, 2);
  lcd.print("Light: "); lcd.print(lux, 0); lcd.print(" lux ");

  lcd.setCursor(0, 3);
  if (motion) {
    lcd.print("MOVE! ");
  } else {
    lcd.print("Quiet ");
  }
  
  lcd.print("| Mic: ");
  lcd.print(soundLevel / 40); // Масштабируем для удобства
  lcd.print("  ");

  delay(500); // Обновление каждые полсекунды
}


/*
 * ═══════════════════════════════════════════════════════
 *  NEXIS Wellness Station — Прошивка ESP32
 *  Версия: 2.0 (Web Dashboard + Telegram)
 *
 *  Датчики:
 *    DHT22  → GPIO4  (температура, влажность)
 *    MQ-135 → GPIO36 (CO2 / качество воздуха)
 *    BH1750 → I2C 0x23 (освещённость)
 *    PIR    → GPIO27 (движение)
 *    KY-037 → GPIO39 (шум)
 *
 *  Вывод:
 *    OLED SSD1306 → I2C 0x3C
 *    RGB LED      → GPIO13/12/14
 *    Зуммер       → GPIO25
 *
 *  Кнопки:
 *    BTN1 (Pomodoro) → GPIO32
 *    BTN2 (Дисплей)  → GPIO33
 * ═══════════════════════════════════════════════════════
 */
/*
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <DHT.h>
#include <BH1750.h>
#include <Adafruit_SSD1306.h>
#include <UniversalTelegramBot.h>

// ════════════════════════════════════════
//  ⚙️  НАСТРОЙКИ — ИЗМЕНИ ЭТО!
// ════════════════════════════════════════

// WiFi (твоя сеть)
#define WIFI_SSID     "ИМЯ_ТВОЕЙ_СЕТИ"
#define WIFI_PASSWORD "ПАРОЛЬ_СЕТИ"

// Адрес Python-сервера (IP твоего компьютера в сети)
// Узнать: в Windows → ipconfig, в Mac/Linux → ifconfig
#define SERVER_URL    "http://192.168.1.100:5000"

// Telegram (получить у @BotFather)
#define BOT_TOKEN     "ТВОЙ_ТОКЕН_БОТА"
#define CHAT_ID       "ТВОЙ_CHAT_ID"

// ════════════════════════════════════════
//  📍 ПИНЫ
// ════════════════════════════════════════
#define PIN_DHT      4
#define PIN_MQ135    36   // ADC1
#define PIN_PIR      27
#define PIN_NOISE    39   // ADC1
#define PIN_LED_R    13
#define PIN_LED_G    12
#define PIN_LED_B    14
#define PIN_BUZZER   25
#define PIN_BTN1     32
#define PIN_BTN2     33

// I2C (OLED + BH1750)
#define I2C_SDA 21
#define I2C_SCL 22

// ════════════════════════════════════════
//  ⏱️  ИНТЕРВАЛЫ (миллисекунды)
// ════════════════════════════════════════
#define INTERVAL_SENSORS   10000UL   // Читать датчики каждые 10 сек
#define INTERVAL_SEND      10000UL   // Отправлять данные каждые 10 сек
#define INTERVAL_DISPLAY   5000UL    // Менять экран OLED каждые 5 сек
#define INTERVAL_TELEGRAM  8000UL    // Проверять Telegram каждые 8 сек
#define INTERVAL_BLINK     500UL     // Мигание при ошибке

// ════════════════════════════════════════
//  🚨 ПОРОГОВЫЕ ЗНАЧЕНИЯ
// ════════════════════════════════════════
#define CO2_WARN     800
#define CO2_DANGER   1200
#define TEMP_WARN    27.0
#define TEMP_DANGER  30.0
#define HUMID_WARN   70.0
#define LIGHT_WARN   150.0
#define NOISE_WARN   60
#define NOISE_DANGER 75

// ════════════════════════════════════════
//  POMODORO
// ════════════════════════════════════════
#define POMO_WORK_MIN  25
#define POMO_BREAK_MIN  5

// ════════════════════════════════════════
//  ОБЪЕКТЫ УСТРОЙСТВ
// ════════════════════════════════════════
DHT             dht(PIN_DHT, DHT22);
BH1750          bh1750;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
WiFiClientSecure tlsClient;
UniversalTelegramBot bot(BOT_TOKEN, tlsClient);

// ════════════════════════════════════════
//  ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ════════════════════════════════════════

// Данные датчиков
struct SensorData {
  float temperature = 0;
  float humidity    = 0;
  float co2         = 0;
  float light       = 0;
  int   noise       = 0;
  bool  motion      = false;
  bool  valid       = false;
};
SensorData sensors;

// Таймеры (millis)
unsigned long lastSensorRead  = 0;
unsigned long lastSend        = 0;
unsigned long lastDisplay     = 0;
unsigned long lastTelegram    = 0;

// OLED страницы: 0=основные, 1=CO2+свет, 2=pomodoro, 3=IP
uint8_t displayPage = 0;

// Pomodoro
struct Pomodoro {
  bool    running   = false;
  bool    isBreak   = false;
  uint8_t cyclesDone = 0;
  unsigned long startMs = 0;
  uint32_t durationMs   = POMO_WORK_MIN * 60000UL;

  int remainingSec() {
    if (!running) return POMO_WORK_MIN * 60;
    long elapsed = (millis() - startMs) / 1000;
    long dur     = durationMs / 1000;
    return max(0L, dur - elapsed);
  }
  bool isDone() {
    return running && millis() - startMs >= durationMs;
  }
  void start() {
    running    = true;
    isBreak    = false;
    startMs    = millis();
    durationMs = POMO_WORK_MIN * 60000UL;
  }
  void startBreak() {
    running    = true;
    isBreak    = true;
    startMs    = millis();
    durationMs = POMO_BREAK_MIN * 60000UL;
  }
  void stop() {
    running = false;
    isBreak = false;
    cyclesDone = 0;
  }
} pomo;

// WiFi статус
bool wifiConnected = false;

// ════════════════════════════════════════
//  🔧 ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ════════════════════════════════════════

void setLED(bool r, bool g, bool b) {
  digitalWrite(PIN_LED_R, r ? HIGH : LOW);
  digitalWrite(PIN_LED_G, g ? HIGH : LOW);
  digitalWrite(PIN_LED_B, b ? HIGH : LOW);
}

void beep(int freq, int durationMs) {
  ledcAttachPin(PIN_BUZZER, 0);
  ledcSetup(0, freq, 8);
  ledcWrite(0, 128);
  delay(durationMs);
  ledcWrite(0, 0);
}

void beepShort() { beep(1000, 80); }
void beepDone()  { beep(800, 200); delay(100); beep(1200, 300); }
void beepAlert() { beep(500, 500); }

// ════════════════════════════════════════
//  📡 WIFI ПОДКЛЮЧЕНИЕ
// ════════════════════════════════════════
void connectWiFi() {
  Serial.print("📶 Подключение к WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    setLED(false, false, true); delay(250);
    setLED(false, false, false); delay(250);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✅ WiFi подключён!");
    Serial.print("   IP: "); Serial.println(WiFi.localIP());
    setLED(false, true, false); // Зелёный = ОК
    delay(500);
    setLED(false, false, false);
    beepShort();
  } else {
    Serial.println("\n❌ Не удалось подключиться к WiFi");
    Serial.println("   Работаем в автономном режиме");
    setLED(true, false, false); // Красный = нет WiFi
    delay(1000);
    setLED(false, false, false);
  }
}

// ════════════════════════════════════════
//  📊 ЧТЕНИЕ ДАТЧИКОВ
// ════════════════════════════════════════
void readSensors() {
  // DHT22 — температура и влажность
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) {
    sensors.temperature = t;
    sensors.humidity    = h;
  }

  // BH1750 — освещённость
  float lux = bh1750.readLightLevel();
  if (lux >= 0) sensors.light = lux;

  // MQ-135 — качество воздуха (CO2 в ppm, приближённо)
  int rawAir = analogRead(PIN_MQ135);
  // Простая линейная конвертация для курсовой
  // (для точной нужна калибровка на улице)
  sensors.co2 = map(rawAir, 0, 4095, 400, 2000);

  // KY-037 — шум (ADC → dB приближённо)
  int rawNoise = analogRead(PIN_NOISE);
  sensors.noise = map(rawNoise, 0, 4095, 30, 100);

  // PIR — движение
  sensors.motion = digitalRead(PIN_PIR) == HIGH;

  sensors.valid = true;

  Serial.printf("[Датчики] T=%.1f°C H=%.1f%% CO2=%.0fppm L=%.0flux N=%ddB M=%d\n",
    sensors.temperature, sensors.humidity,
    sensors.co2, sensors.light,
    sensors.noise, sensors.motion ? 1 : 0);
}

// ════════════════════════════════════════
//  🌈 ИНДИКАЦИЯ LED ПО ДАННЫМ
// ════════════════════════════════════════
void updateLED() {
  if (!sensors.valid) return;

  if (sensors.co2 > CO2_DANGER || sensors.noise > NOISE_DANGER) {
    setLED(true, false, false);   // Красный — опасность
  } else if (sensors.co2 > CO2_WARN || sensors.noise > NOISE_WARN ||
             sensors.light < LIGHT_WARN || sensors.temperature > TEMP_WARN) {
    setLED(true, true, false);    // Жёлтый — предупреждение
  } else {
    setLED(false, true, false);   // Зелёный — всё OK
  }
}

// ════════════════════════════════════════
//  📺 OLED ДИСПЛЕЙ
// ════════════════════════════════════════
void drawPage0() {
  // Страница 0: Температура и влажность
  oled.clearDisplay();
  oled.setTextColor(WHITE);

  // Заголовок
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.print("NEXIS Wellness");

  // Разделитель
  oled.drawLine(0, 9, 127, 9, WHITE);

  // Температура — большой шрифт
  oled.setTextSize(2);
  oled.setCursor(0, 14);
  oled.printf("%.1f", sensors.temperature);
  oled.setTextSize(1);
  oled.setCursor(60, 14);
  oled.print("o");
  oled.setTextSize(2);
  oled.setCursor(66, 14);
  oled.print("C");

  // Влажность
  oled.setTextSize(1);
  oled.setCursor(0, 40);
  oled.printf("Влаж: %.0f%%", sensors.humidity);

  // WiFi статус
  oled.setCursor(80, 56);
  oled.print(wifiConnected ? "WiFi OK" : "No WiFi");

  oled.display();
}

void drawPage1() {
  // Страница 1: CO2 и освещённость
  oled.clearDisplay();
  oled.setTextColor(WHITE);
  oled.setTextSize(1);

  oled.setCursor(0, 0);
  oled.print("Качество воздуха:");

  oled.setTextSize(2);
  oled.setCursor(0, 12);
  oled.printf("%.0f", sensors.co2);
  oled.setTextSize(1);
  oled.setCursor(70, 20);
  oled.print("ppm");

  // Статус CO2
  oled.setCursor(0, 34);
  if (sensors.co2 > CO2_DANGER)    oled.print("!! ПРОВЕТРИТЕ !!");
  else if (sensors.co2 > CO2_WARN) oled.print("! Повышен CO2");
  else                              oled.print("CO2 в норме");

  oled.setCursor(0, 48);
  oled.printf("Свет: %.0f lux", sensors.light);
  if (sensors.light < LIGHT_WARN) {
    oled.setCursor(80, 48);
    oled.print("!Темно");
  }

  oled.display();
}

void drawPage2() {
  // Страница 2: Pomodoro
  oled.clearDisplay();
  oled.setTextColor(WHITE);
  oled.setTextSize(1);

  oled.setCursor(0, 0);
  oled.print("Pomodoro Timer");
  oled.drawLine(0, 9, 127, 9, WHITE);

  if (!pomo.running) {
    oled.setTextSize(2);
    oled.setCursor(10, 20);
    oled.print("25:00");
    oled.setTextSize(1);
    oled.setCursor(0, 50);
    oled.print("Нажми кнопку");
  } else {
    int sec = pomo.remainingSec();
    int m = sec / 60, s = sec % 60;

    oled.setTextSize(2);
    oled.setCursor(10, 18);
    oled.printf("%02d:%02d", m, s);

    oled.setTextSize(1);
    oled.setCursor(0, 42);
    oled.print(pomo.isBreak ? "Перерыв" : "Работаем");

    oled.setCursor(0, 54);
    oled.printf("Циклов: %d", pomo.cyclesDone);
  }

  oled.display();
}

void drawPage3() {
  // Страница 3: Системная информация
  oled.clearDisplay();
  oled.setTextColor(WHITE);
  oled.setTextSize(1);

  oled.setCursor(0, 0);
  oled.print("Системная инфо");
  oled.drawLine(0, 9, 127, 9, WHITE);

  oled.setCursor(0, 14);
  if (wifiConnected) {
    oled.print("IP:");
    oled.setCursor(0, 24);
    oled.print(WiFi.localIP().toString());
  } else {
    oled.print("WiFi: Не подключен");
  }

  oled.setCursor(0, 38);
  oled.printf("RAM: %d KB", ESP.getFreeHeap() / 1024);

  oled.setCursor(0, 50);
  unsigned long upSec = millis() / 1000;
  oled.printf("Up: %dч %dм", upSec/3600, (upSec%3600)/60);

  oled.display();
}

void updateDisplay() {
  if (!sensors.valid) {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.setTextColor(WHITE);
    oled.print("Инициализация...");
    oled.display();
    return;
  }
  switch (displayPage) {
    case 0: drawPage0(); break;
    case 1: drawPage1(); break;
    case 2: drawPage2(); break;
    case 3: drawPage3(); break;
  }
}

// ════════════════════════════════════════
//  📤 ОТПРАВКА ДАННЫХ НА СЕРВЕР
// ════════════════════════════════════════
void sendToServer() {
  if (!wifiConnected || !sensors.valid) return;

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/data");
  http.addHeader("Content-Type", "application/json");

  // Строим JSON
  StaticJsonDocument<256> doc;
  doc["temperature"] = round(sensors.temperature * 10) / 10.0;
  doc["humidity"]    = round(sensors.humidity);
  doc["co2"]         = round(sensors.co2);
  doc["light"]       = round(sensors.light);
  doc["noise"]       = sensors.noise;
  doc["motion"]      = sensors.motion ? 1 : 0;

  String json;
  serializeJson(doc, json);

  int code = http.POST(json);
  if (code == 200) {
    Serial.println("✅ Данные отправлены на сервер");
  } else {
    Serial.printf("❌ Ошибка отправки: HTTP %d\n", code);
  }
  http.end();
}

// ════════════════════════════════════════
//  📱 TELEGRAM БОТ
// ════════════════════════════════════════
String buildStatusMsg() {
  String s = "📊 *NEXIS Wellness Station*\n\n";
  s += "🌡 Температура: " + String(sensors.temperature, 1) + "°C\n";
  s += "💧 Влажность: "   + String((int)sensors.humidity)  + "%\n";
  s += "🌬 CO2: "          + String((int)sensors.co2)        + " ppm\n";
  s += "💡 Свет: "         + String((int)sensors.light)      + " lux\n";
  s += "🔊 Шум: "          + String(sensors.noise)           + " dB\n";
  s += "👤 Движение: "     + String(sensors.motion ? "Да" : "Нет") + "\n";

  s += "\n🍅 Pomodoro:\n";
  s += "  Циклов сегодня: " + String(pomo.cyclesDone) + "\n";
  if (pomo.running) {
    int sec = pomo.remainingSec();
    s += "  Осталось: " + String(sec/60) + ":" + String(sec%60 < 10 ? "0" : "") + String(sec%60) + "\n";
    s += "  Режим: " + String(pomo.isBreak ? "Перерыв" : "Работа") + "\n";
  } else {
    s += "  Статус: Остановлен\n";
  }

  if (wifiConnected) {
    s += "\n🌐 IP: " + WiFi.localIP().toString();
  }
  return s;
}

void handleTelegramMessages(int n) {
  for (int i = 0; i < n; i++) {
    String chatId = bot.messages[i].chat_id;
    String text   = bot.messages[i].text;
    String name   = bot.messages[i].from_name;

    // Проверка доступа
    if (chatId != CHAT_ID) {
      bot.sendMessage(chatId, "⛔ Доступ запрещён", "");
      continue;
    }

    Serial.print("📱 Telegram: "); Serial.println(text);

    if (text == "/start") {
      String msg = "👋 Привет, " + name + "!\n\n";
      msg += "🏠 *NEXIS Wellness Station* готова.\n\n";
      msg += "/status — текущие показания\n";
      msg += "/pomodoro — запустить таймер\n";
      msg += "/stop — остановить таймер\n";
      msg += "/help — справка\n";
      msg += "/ip — IP адрес устройства";
      bot.sendMessage(chatId, msg, "Markdown");
    }

    else if (text == "/status") {
      bot.sendMessage(chatId, buildStatusMsg(), "Markdown");
    }

    else if (text == "/pomodoro" || text == "/start_pomo") {
      if (!pomo.running) {
        pomo.start();
        bot.sendMessage(chatId, "🍅 Pomodoro запущен!\n⏱ 25 минут работы. Удачи!", "");
      } else {
        bot.sendMessage(chatId, "⚠️ Pomodoro уже идёт!", "");
      }
    }

    else if (text == "/stop") {
      pomo.stop();
      bot.sendMessage(chatId, "⏹ Pomodoro остановлен.", "");
    }

    else if (text == "/ip") {
      String msg = wifiConnected
        ? "🌐 IP: " + WiFi.localIP().toString() + "\n📊 Dashboard: " + SERVER_URL
        : "❌ WiFi не подключён";
      bot.sendMessage(chatId, msg, "");
    }

    else if (text == "/help") {
      String h = "📋 *Команды бота:*\n\n";
      h += "/status — показания датчиков\n";
      h += "/pomodoro — запустить Pomodoro (25 мин)\n";
      h += "/stop — остановить Pomodoro\n";
      h += "/ip — IP адрес и ссылка на dashboard\n";
      h += "/help — эта справка";
      bot.sendMessage(chatId, h, "Markdown");
    }

    else {
      bot.sendMessage(chatId, "❓ Неизвестная команда. Используй /help", "");
    }
  }
}

void checkTelegram() {
  if (!wifiConnected) return;
  int n = bot.getUpdates(bot.last_message_received + 1);
  while (n) {
    handleTelegramMessages(n);
    n = bot.getUpdates(bot.last_message_received + 1);
  }
}

// ════════════════════════════════════════
//  🍅 POMODORO ЛОГИКА
// ════════════════════════════════════════
void handlePomodoro() {
  if (!pomo.running) return;

  if (pomo.isDone()) {
    if (!pomo.isBreak) {
      // Рабочий цикл завершён
      pomo.cyclesDone++;
      beepDone();
      setLED(false, true, false); delay(200); setLED(false, false, false);
      setLED(false, true, false); delay(200); setLED(false, false, false);

      // Сообщаем серверу
      if (wifiConnected) {
        HTTPClient http;
        http.begin(String(SERVER_URL) + "/api/pomodoro");
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"type\":\"work\",\"duration\":25}");
        http.end();
      }

      // Telegram уведомление
      if (wifiConnected) {
        String msg = "🍅 Pomodoro #" + String(pomo.cyclesDone) + " завершён!\n";
        msg += "☕ Перерыв 5 минут. Отдохни!";
        bot.sendMessage(CHAT_ID, msg, "");
      }

      pomo.startBreak();

    } else {
      // Перерыв завершён
      beepShort(); delay(100); beepShort();

      if (wifiConnected) {
        bot.sendMessage(CHAT_ID, "⚡ Перерыв окончен! Начинаем новый цикл?\n/pomodoro", "");
      }
      pomo.running = false;
      pomo.isBreak = false;
    }
  }
}

// ════════════════════════════════════════
//  🔘 КНОПКИ
// ════════════════════════════════════════
void handleButtons() {
  static bool btn1Prev = HIGH, btn2Prev = HIGH;
  static unsigned long btn1Time = 0, btn2Time = 0;

  bool btn1 = digitalRead(PIN_BTN1);
  bool btn2 = digitalRead(PIN_BTN2);

  // BTN1 — Pomodoro старт/стоп (фронт нажатия)
  if (btn1 == LOW && btn1Prev == HIGH && millis() - btn1Time > 300) {
    btn1Time = millis();
    if (!pomo.running) {
      pomo.start();
      beepShort();
      if (wifiConnected) bot.sendMessage(CHAT_ID, "🍅 Pomodoro запущен с кнопки!", "");
    } else {
      pomo.stop();
      beepShort(); delay(100); beepShort();
    }
  }
  btn1Prev = btn1;

  // BTN2 — смена страницы OLED
  if (btn2 == LOW && btn2Prev == HIGH && millis() - btn2Time > 300) {
    btn2Time = millis();
    displayPage = (displayPage + 1) % 4;
    beepShort();
  }
  btn2Prev = btn2;
}

// ════════════════════════════════════════
//  🚀 SETUP
// ════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n══════════════════════════════");
  Serial.println("   NEXIS Wellness Station v2.0");
  Serial.println("══════════════════════════════");

  // Пины
  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_BTN1, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);

  setLED(false, false, true); // Синий = инициализация

  // I2C
  Wire.begin(I2C_SDA, I2C_SCL);

  // OLED
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("❌ OLED не найден!");
  } else {
    oled.clearDisplay();
    oled.setTextColor(WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.println("NEXIS Wellness");
    oled.println("Station v2.0");
    oled.println("");
    oled.println("Инициализация...");
    oled.display();
    Serial.println("✅ OLED инициализирован");
  }

  // DHT22
  dht.begin();
  Serial.println("✅ DHT22 инициализирован");

  // BH1750
  if (bh1750.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("✅ BH1750 инициализирован");
  } else {
    Serial.println("⚠️  BH1750 не найден");
  }

  // WiFi
  connectWiFi();

  // Telegram (HTTPS не верифицируем для простоты в курсовой)
  tlsClient.setInsecure();

  // Начальное чтение
  delay(2000);
  readSensors();
  updateDisplay();
  updateLED();

  // Приветствие в Telegram
  if (wifiConnected) {
    String hello = "✅ *NEXIS Wellness Station* запущена!\n\n";
    hello += "🌐 Dashboard: " + String(SERVER_URL) + "\n";
    hello += "📊 IP: " + WiFi.localIP().toString();
    bot.sendMessage(CHAT_ID, hello, "Markdown");
  }

  setLED(false, false, false);
  beepShort();
  Serial.println("\n✅ Инициализация завершена. Начинаем работу!\n");
}

// ════════════════════════════════════════
//  🔄 LOOP
// ════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // 1. Читаем датчики
  if (now - lastSensorRead >= INTERVAL_SENSORS) {
    lastSensorRead = now;
    readSensors();
    updateLED();
  }

  // 2. Отправляем данные на сервер
  if (now - lastSend >= INTERVAL_SEND) {
    lastSend = now;
    sendToServer();
  }

  // 3. Обновляем OLED
  if (now - lastDisplay >= INTERVAL_DISPLAY) {
    lastDisplay = now;
    // Автопролистывание (не на Pomodoro странице)
    if (!pomo.running || displayPage != 2) {
      displayPage = (displayPage + 1) % 4;
    }
    updateDisplay();
  }

  // 4. Pomodoro
  handlePomodoro();
  if (pomo.running && displayPage == 2) {
    // Обновляем OLED каждую секунду если открыт Pomodoro
    static unsigned long lastPomoDisplay = 0;
    if (now - lastPomoDisplay >= 1000) {
      lastPomoDisplay = now;
      drawPage2();
    }
  }

  // 5. Кнопки
  handleButtons();

  // 6. Telegram
  if (now - lastTelegram >= INTERVAL_TELEGRAM) {
    lastTelegram = now;
    checkTelegram();
  }

  // 7. Переподключение WiFi если пропало
  if (WiFi.status() != WL_CONNECTED && wifiConnected) {
    Serial.println("⚠️  WiFi потеряно, переподключаемся...");
    wifiConnected = false;
    connectWiFi();
  }

  delay(10);
}
*/