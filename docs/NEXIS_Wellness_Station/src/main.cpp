/**
 * NEXIS Wellness Station
 * Умная станция контроля здоровья на рабочем месте
 * 
 * Курсовой проект PM3304 - Программирование микроконтроллеров
 * ЕНУ им. Л.Н. Гумилёва, 2026
 * 
 * Платформа: ESP32 DevKit V1
 * Датчики: DHT22, MQ-135, BH1750, PIR, KY-037
 * Дисплей: OLED SSD1306 128x64
 * Связь: WiFi, Telegram Bot API
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <BH1750.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ============================================================================
// КОНФИГУРАЦИЯ - НАСТРОЙТЕ ПОД СЕБЯ!
// ============================================================================

// Wi-Fi настройки
#define WIFI_SSID "YOUR_WIFI_SSID"        // ← Замените на ваш Wi-Fi
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD" // ← Замените на ваш пароль

// Telegram Bot настройки
#define BOT_TOKEN "123456789:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" // ← Токен от @BotFather
#define CHAT_ID "987654321" // ← Ваш Chat ID (получить от @userinfobot)

// ============================================================================
// ПИНЫ ПОДКЛЮЧЕНИЯ
// ============================================================================

// Датчики
#define DHT_PIN 4           // DHT22 температура/влажность
#define MQ135_PIN 36        // MQ-135 качество воздуха (ADC)
#define PIR_PIN 27          // PIR датчик движения
#define SOUND_PIN 39        // KY-037 звук (ADC)
#define I2C_SDA 21          // I2C Data (BH1750 + OLED)
#define I2C_SCL 22          // I2C Clock

// Индикация
#define LED_R 13            // RGB LED красный
#define LED_G 12            // RGB LED зелёный
#define LED_B 14            // RGB LED синий
#define BUZZER_PIN 25       // Зуммер

// Кнопки
#define BTN_MODE 32         // Кнопка MODE
#define BTN_OK 33           // Кнопка OK
#define BTN_CANCEL 5        // Кнопка CANCEL

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

// DHT настройки
#define DHTTYPE DHT22

// OLED настройки
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

// Интервалы обновления (мс)
#define SENSOR_UPDATE_INTERVAL 5000   // 5 секунд
#define DISPLAY_UPDATE_INTERVAL 100   // 10 FPS
#define TELEGRAM_UPDATE_INTERVAL 1000 // 1 секунда
#define MOTION_CHECK_INTERVAL 2000    // 2 секунды

// Пороговые значения для алертов
#define TEMP_HIGH_THRESHOLD 28.0      // °C
#define TEMP_LOW_THRESHOLD 18.0       // °C
#define HUMIDITY_HIGH_THRESHOLD 70.0  // %
#define HUMIDITY_LOW_THRESHOLD 30.0   // %
#define CO2_HIGH_THRESHOLD 1000       // ppm
#define LUX_LOW_THRESHOLD 300         // lux
#define SITTING_TIME_THRESHOLD 7200000 // 2 часа в мс

// Pomodoro настройки
#define POMODORO_WORK_TIME 1500000    // 25 минут в мс
#define POMODORO_SHORT_BREAK 300000   // 5 минут в мс
#define POMODORO_LONG_BREAK 900000    // 15 минут в мс

// ============================================================================
// ГЛОБАЛЬНЫЕ ОБЪЕКТЫ
// ============================================================================

// Датчики
DHT dht(DHT_PIN, DHTTYPE);
BH1750 lightMeter;

// Дисплей
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Telegram Bot
WiFiClientSecure secured_client;
UniversalTelegramBot bot(BOT_TOKEN, secured_client);

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

// Данные датчиков
float temperature = 0.0;
float humidity = 0.0;
int co2_ppm = 0;
float lux = 0.0;
bool motion_detected = false;
int sound_level = 0;

// Временные метки
unsigned long lastSensorUpdate = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastTelegramUpdate = 0;
unsigned long lastMotionTime = 0;
unsigned long lastMotionCheck = 0;
unsigned long sittingStartTime = 0;
bool isSitting = true;

// Pomodoro таймер
enum PomodoroState { IDLE, WORK, SHORT_BREAK, LONG_BREAK };
PomodoroState pomodoroState = IDLE;
unsigned long pomodoroStartTime = 0;
unsigned long pomodoroDuration = 0;
int pomodoroCount = 0;

// Статистика
int dailyPomodoroCount = 0;
int alertCount = 0;

// Флаги алертов
bool co2AlertSent = false;
bool tempAlertSent = false;
bool lightAlertSent = false;
bool sittingAlertSent = false;

// ============================================================================
// ПРОТОТИПЫ ФУНКЦИЙ
// ============================================================================

// Инициализация
void initWiFi();
void initSensors();
void initDisplay();
void initTelegram();
void initPins();

// Датчики
void updateSensors();
float readTemperature();
float readHumidity();
int readCO2();
float readLux();
bool readMotion();
int readSoundLevel();

// Дисплей
void updateDisplay();
void displayMainScreen();
void displayPomodoroScreen();
void displayAlertScreen(String message);

// Pomodoro
void startPomodoro(PomodoroState state);
void stopPomodoro();
void updatePomodoro();
String getPomodoroTimeString();

// Алерты
void checkAlerts();
void triggerAlert(String message);
void setLED(int r, int g, int b);
void playTone(int frequency, int duration);

// Telegram
void handleTelegramMessages();
void sendTelegramMessage(String message);
void sendStatus();
void sendStats();

// Кнопки
void handleButtons();

// Утилиты
String formatTime(unsigned long ms);
String getMotionStatusString();

// ============================================================================
// SETUP - ИНИЦИАЛИЗАЦИЯ
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║   NEXIS WELLNESS STATION v1.0        ║");
  Serial.println("║   Запуск системы...                  ║");
  Serial.println("╚════════════════════════════════════════╝\n");
  
  // Инициализация компонентов
  initPins();
  initWiFi();
  initSensors();
  initDisplay();
  initTelegram();
  
  Serial.println("\n✅ Система готова к работе!\n");
  
  // Приветственное сообщение
  sendTelegramMessage("🟢 NEXIS Wellness Station запущена!\n\n"
                     "Используйте /help для списка команд.");
  
  // Начальное обновление датчиков
  updateSensors();
  
  // Звуковой сигнал готовности
  playTone(1000, 200);
  delay(100);
  playTone(1500, 200);
}

// ============================================================================
// LOOP - ГЛАВНЫЙ ЦИКЛ
// ============================================================================

void loop() {
  unsigned long currentMillis = millis();
  
  // Обновление датчиков (каждые 5 секунд)
  if (currentMillis - lastSensorUpdate >= SENSOR_UPDATE_INTERVAL) {
    lastSensorUpdate = currentMillis;
    updateSensors();
    checkAlerts();
  }
  
  // Обновление дисплея (10 FPS)
  if (currentMillis - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
    lastDisplayUpdate = currentMillis;
    updateDisplay();
  }
  
  // Обработка Telegram (каждую секунду)
  if (currentMillis - lastTelegramUpdate >= TELEGRAM_UPDATE_INTERVAL) {
    lastTelegramUpdate = currentMillis;
    handleTelegramMessages();
  }
  
  // Проверка движения (каждые 2 секунды)
  if (currentMillis - lastMotionCheck >= MOTION_CHECK_INTERVAL) {
    lastMotionCheck = currentMillis;
    
    if (motion_detected) {
      lastMotionTime = currentMillis;
      if (isSitting) {
        sittingStartTime = currentMillis;
        isSitting = false;
        sittingAlertSent = false;
      }
    } else {
      // Нет движения более 5 минут = сидит
      if (currentMillis - lastMotionTime > 300000 && !isSitting) {
        isSitting = true;
        sittingStartTime = currentMillis;
      }
    }
  }
  
  // Обновление Pomodoro таймера
  updatePomodoro();
  
  // Обработка кнопок
  handleButtons();
  
  delay(10); // Небольшая задержка для стабильности
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

void initPins() {
  Serial.println("🔧 Инициализация пинов...");
  
  // Выходы
  pinMode(LED_R, OUTPUT);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Входы
  pinMode(PIR_PIN, INPUT);
  pinMode(BTN_MODE, INPUT_PULLUP);
  pinMode(BTN_OK, INPUT_PULLUP);
  pinMode(BTN_CANCEL, INPUT_PULLUP);
  
  // Выключить LED
  setLED(0, 0, 0);
  
  Serial.println("✅ Пины настроены");
}

void initWiFi() {
  Serial.println("📡 Подключение к Wi-Fi...");
  Serial.printf("   SSID: %s\n", WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi подключен!");
    Serial.printf("   IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("   Сигнал: %d dBm\n", WiFi.RSSI());
    setLED(0, 255, 0); // Зелёный = успех
    delay(500);
    setLED(0, 0, 0);
  } else {
    Serial.println("\n❌ Не удалось подключиться к Wi-Fi!");
    setLED(255, 0, 0); // Красный = ошибка
    delay(2000);
    setLED(0, 0, 0);
  }
}

void initSensors() {
  Serial.println("🌡️  Инициализация датчиков...");
  
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // DHT22
  dht.begin();
  Serial.println("   ✅ DHT22 (температура/влажность)");
  
  // BH1750
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("   ✅ BH1750 (освещённость)");
  } else {
    Serial.println("   ❌ BH1750 не найден!");
  }
  
  // MQ-135
  pinMode(MQ135_PIN, INPUT);
  Serial.println("   ✅ MQ-135 (качество воздуха)");
  
  // PIR
  Serial.println("   ✅ PIR (движение)");
  
  // KY-037
  pinMode(SOUND_PIN, INPUT);
  Serial.println("   ✅ KY-037 (звук)");
  
  Serial.println("✅ Все датчики инициализированы");
}

void initDisplay() {
  Serial.println("🖥️  Инициализация дисплея...");
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("   ❌ OLED не найден!");
    return;
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  // Заставка
  display.setCursor(10, 20);
  display.setTextSize(2);
  display.println("NEXIS");
  display.setTextSize(1);
  display.setCursor(15, 40);
  display.println("Wellness Station");
  display.display();
  delay(2000);
  
  Serial.println("✅ Дисплей готов");
}

void initTelegram() {
  Serial.println("🤖 Инициализация Telegram Bot...");
  
  secured_client.setInsecure(); // Отключаем проверку SSL для упрощения
  
  // Проверка подключения
  String welcome = "🟢 NEXIS Wellness Station\nСистема инициализируется...";
  if (sendTelegramMessage(welcome)) {
    Serial.println("✅ Telegram Bot готов");
  } else {
    Serial.println("⚠️  Telegram Bot: проблемы с подключением");
  }
}

// ============================================================================
// ДАТЧИКИ
// ============================================================================

void updateSensors() {
  temperature = readTemperature();
  humidity = readHumidity();
  co2_ppm = readCO2();
  lux = readLux();
  motion_detected = readMotion();
  sound_level = readSoundLevel();
  
  // Вывод в Serial Monitor
  Serial.println("─────────────────────────────────");
  Serial.printf("🌡️  Температура: %.1f°C\n", temperature);
  Serial.printf("💧 Влажность: %.1f%%\n", humidity);
  Serial.printf("🫁 CO2: %d ppm\n", co2_ppm);
  Serial.printf("💡 Освещённость: %.0f lux\n", lux);
  Serial.printf("👁️  Движение: %s\n", motion_detected ? "ДА" : "НЕТ");
  Serial.printf("🔊 Звук: %d\n", sound_level);
  Serial.println("─────────────────────────────────");
}

float readTemperature() {
  float temp = dht.readTemperature();
  return isnan(temp) ? 0.0 : temp;
}

float readHumidity() {
  float hum = dht.readHumidity();
  return isnan(hum) ? 0.0 : hum;
}

int readCO2() {
  // MQ-135 калибровка (упрощённая формула)
  int rawValue = analogRead(MQ135_PIN);
  
  // Преобразование ADC в примерные ppm
  // Формула зависит от калибровки датчика
  // Здесь используется упрощённый вариант
  float resistance = (4095.0 / rawValue) - 1.0;
  int ppm = (int)(400 + (resistance * 100)); // Базовый уровень 400 ppm
  
  return ppm;
}

float readLux() {
  float luxValue = lightMeter.readLightLevel();
  return luxValue > 0 ? luxValue : 0.0;
}

bool readMotion() {
  return digitalRead(PIR_PIN) == HIGH;
}

int readSoundLevel() {
  return analogRead(SOUND_PIN);
}

// ============================================================================
// ДИСПЛЕЙ
// ============================================================================

void updateDisplay() {
  if (pomodoroState != IDLE) {
    displayPomodoroScreen();
  } else {
    displayMainScreen();
  }
}

void displayMainScreen() {
  display.clearDisplay();
  
  // Заголовок
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("NEXIS Wellness");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  // Данные датчиков
  display.setCursor(0, 14);
  display.printf("%.1fC  %.0f%%", temperature, humidity);
  
  display.setCursor(0, 24);
  display.printf("CO2: %d ppm", co2_ppm);
  
  display.setCursor(0, 34);
  display.printf("Lux: %.0f", lux);
  
  display.setCursor(0, 44);
  display.printf("Move: %s", motion_detected ? "YES" : "NO");
  
  // Статус сидения
  if (isSitting) {
    unsigned long sittingTime = millis() - sittingStartTime;
    display.setCursor(0, 54);
    display.printf("Sit: %s", formatTime(sittingTime).c_str());
  }
  
  // Wi-Fi статус
  if (WiFi.status() == WL_CONNECTED) {
    display.setCursor(110, 0);
    display.print("W");
  }
  
  display.display();
}

void displayPomodoroScreen() {
  display.clearDisplay();
  
  // Заголовок
  display.setTextSize(1);
  display.setCursor(0, 0);
  if (pomodoroState == WORK) {
    display.println("POMODORO - WORK");
  } else if (pomodoroState == SHORT_BREAK) {
    display.println("POMODORO - BREAK");
  } else if (pomodoroState == LONG_BREAK) {
    display.println("POMODORO - LONG");
  }
  
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  // Таймер (большими цифрами)
  String timeStr = getPomodoroTimeString();
  display.setTextSize(3);
  display.setCursor(15, 25);
  display.print(timeStr);
  
  // Счётчик циклов
  display.setTextSize(1);
  display.setCursor(0, 54);
  display.printf("Cycles: %d", pomodoroCount);
  
  display.display();
}

void displayAlertScreen(String message) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("!!! ALERT !!!");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(message);
  display.display();
}

// ============================================================================
// POMODORO
// ============================================================================

void startPomodoro(PomodoroState state) {
  pomodoroState = state;
  pomodoroStartTime = millis();
  
  if (state == WORK) {
    pomodoroDuration = POMODORO_WORK_TIME;
    sendTelegramMessage("🍅 Pomodoro работа началась!\n25 минут на задачу.");
    setLED(255, 0, 0); // Красный = работа
  } else if (state == SHORT_BREAK) {
    pomodoroDuration = POMODORO_SHORT_BREAK;
    sendTelegramMessage("☕ Короткий перерыв!\n5 минут отдыха.");
    setLED(0, 255, 0); // Зелёный = перерыв
  } else if (state == LONG_BREAK) {
    pomodoroDuration = POMODORO_LONG_BREAK;
    sendTelegramMessage("🛋️ Длинный перерыв!\n15 минут отдыха.");
    setLED(0, 0, 255); // Синий = длинный перерыв
  }
  
  delay(500);
  setLED(0, 0, 0);
}

void stopPomodoro() {
  pomodoroState = IDLE;
  sendTelegramMessage("⏹️ Pomodoro остановлен.");
}

void updatePomodoro() {
  if (pomodoroState == IDLE) return;
  
  unsigned long elapsed = millis() - pomodoroStartTime;
  
  if (elapsed >= pomodoroDuration) {
    // Таймер завершён
    if (pomodoroState == WORK) {
      pomodoroCount++;
      dailyPomodoroCount++;
      
      // Звуковой сигнал
      for (int i = 0; i < 3; i++) {
        playTone(1000, 200);
        delay(200);
      }
      
      sendTelegramMessage("✅ Pomodoro завершён!\n\n"
                         "Сделайте перерыв 5 минут.\n"
                         "Сегодня: " + String(dailyPomodoroCount) + " циклов");
      
      // Автоматически запустить перерыв
      if (pomodoroCount % 4 == 0) {
        startPomodoro(LONG_BREAK);
      } else {
        startPomodoro(SHORT_BREAK);
      }
      
    } else {
      // Перерыв завершён
      playTone(800, 500);
      sendTelegramMessage("⏰ Перерыв закончен!\n\nВремя работать!");
      pomodoroState = IDLE;
      setLED(0, 0, 0);
    }
  }
}

String getPomodoroTimeString() {
  unsigned long elapsed = millis() - pomodoroStartTime;
  unsigned long remaining = pomodoroDuration - elapsed;
  
  int minutes = remaining / 60000;
  int seconds = (remaining % 60000) / 1000;
  
  char buffer[10];
  sprintf(buffer, "%02d:%02d", minutes, seconds);
  return String(buffer);
}

// ============================================================================
// АЛЕРТЫ
// ============================================================================

void checkAlerts() {
  // CO2 слишком высокий
  if (co2_ppm > CO2_HIGH_THRESHOLD && !co2AlertSent) {
    triggerAlert("⚠️ CO2: " + String(co2_ppm) + " ppm\n"
                 "Проветрите помещение!");
    co2AlertSent = true;
  } else if (co2_ppm <= CO2_HIGH_THRESHOLD) {
    co2AlertSent = false;
  }
  
  // Температура слишком высокая
  if (temperature > TEMP_HIGH_THRESHOLD && !tempAlertSent) {
    triggerAlert("🔥 Температура: " + String(temperature, 1) + "°C\n"
                 "Слишком жарко!");
    tempAlertSent = true;
  } else if (temperature <= TEMP_HIGH_THRESHOLD) {
    tempAlertSent = false;
  }
  
  // Освещённость слишком низкая
  if (lux < LUX_LOW_THRESHOLD && !lightAlertSent) {
    triggerAlert("💡 Освещение: " + String(lux, 0) + " lux\n"
                 "Включите свет!");
    lightAlertSent = true;
  } else if (lux >= LUX_LOW_THRESHOLD) {
    lightAlertSent = false;
  }
  
  // Долго сидите
  if (isSitting) {
    unsigned long sittingTime = millis() - sittingStartTime;
    if (sittingTime > SITTING_TIME_THRESHOLD && !sittingAlertSent) {
      triggerAlert("⏱️ Вы сидите 2 часа!\n"
                   "Время встать и размяться! 🚶");
      sittingAlertSent = true;
    }
  } else {
    sittingAlertSent = false;
  }
}

void triggerAlert(String message) {
  Serial.println("🚨 ALERT: " + message);
  
  // Отправить в Telegram
  sendTelegramMessage("🚨 ВНИМАНИЕ!\n\n" + message);
  
  // Показать на дисплее
  displayAlertScreen(message);
  
  // Звуковой сигнал
  for (int i = 0; i < 2; i++) {
    setLED(255, 0, 0);
    playTone(1500, 300);
    delay(100);
    setLED(0, 0, 0);
    delay(100);
  }
  
  alertCount++;
}

void setLED(int r, int g, int b) {
  analogWrite(LED_R, r);
  analogWrite(LED_G, g);
  analogWrite(LED_B, b);
}

void playTone(int frequency, int duration) {
  tone(BUZZER_PIN, frequency, duration);
}

// ============================================================================
// TELEGRAM
// ============================================================================

void handleTelegramMessages() {
  int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
  
  for (int i = 0; i < numNewMessages; i++) {
    String chat_id = bot.messages[i].chat_id;
    String text = bot.messages[i].text;
    String from_name = bot.messages[i].from_name;
    
    Serial.println("📱 Telegram: " + from_name + " > " + text);
    
    // Обработка команд
    if (text == "/start") {
      String welcome = "👋 Привет, " + from_name + "!\n\n";
      welcome += "Я NEXIS Wellness Station - ваш персональный ассистент здоровья.\n\n";
      welcome += "Используйте /help для списка команд.";
      bot.sendMessage(chat_id, welcome, "");
      
    } else if (text == "/help") {
      String help = "📋 КОМАНДЫ:\n\n";
      help += "/status - Текущие показания\n";
      help += "/pomodoro - Старт работы (25 мин)\n";
      help += "/break - Перерыв (5 мин)\n";
      help += "/stop - Остановить таймер\n";
      help += "/stats - Статистика за день\n";
      help += "/help - Эта справка\n";
      bot.sendMessage(chat_id, help, "");
      
    } else if (text == "/status") {
      sendStatus();
      
    } else if (text == "/pomodoro") {
      startPomodoro(WORK);
      
    } else if (text == "/break") {
      startPomodoro(SHORT_BREAK);
      
    } else if (text == "/stop") {
      stopPomodoro();
      
    } else if (text == "/stats") {
      sendStats();
      
    } else {
      bot.sendMessage(chat_id, "❓ Неизвестная команда. Используйте /help", "");
    }
  }
}

bool sendTelegramMessage(String message) {
  return bot.sendMessage(CHAT_ID, message, "");
}

void sendStatus() {
  String status = "📊 ТЕКУЩИЙ СТАТУС\n\n";
  status += "🌡️ Температура: " + String(temperature, 1) + "°C\n";
  status += "💧 Влажность: " + String(humidity, 1) + "%\n";
  status += "🫁 CO2: " + String(co2_ppm) + " ppm\n";
  status += "💡 Освещённость: " + String(lux, 0) + " lux\n";
  status += "👁️ Движение: " + getMotionStatusString() + "\n\n";
  
  if (pomodoroState != IDLE) {
    status += "🍅 Pomodoro: " + getPomodoroTimeString() + "\n";
  }
  
  if (isSitting) {
    unsigned long sittingTime = millis() - sittingStartTime;
    status += "🪑 Сидите: " + formatTime(sittingTime) + "\n";
  }
  
  sendTelegramMessage(status);
}

void sendStats() {
  String stats = "📈 СТАТИСТИКА ЗА ДЕНЬ\n\n";
  stats += "🍅 Pomodoro циклов: " + String(dailyPomodoroCount) + "\n";
  stats += "🚨 Алертов: " + String(alertCount) + "\n\n";
  stats += "🌡️ Средняя t°: " + String(temperature, 1) + "°C\n";
  stats += "💧 Средняя влажн.: " + String(humidity, 1) + "%\n";
  stats += "🫁 Средний CO2: " + String(co2_ppm) + " ppm\n";
  
  sendTelegramMessage(stats);
}

// ============================================================================
// КНОПКИ
// ============================================================================

void handleButtons() {
  static unsigned long lastButtonPress = 0;
  unsigned long currentMillis = millis();
  
  // Антидребезг
  if (currentMillis - lastButtonPress < 300) return;
  
  if (digitalRead(BTN_MODE) == LOW) {
    lastButtonPress = currentMillis;
    Serial.println("🔘 Кнопка MODE");
    
    // Переключение режимов дисплея
    if (pomodoroState == IDLE) {
      startPomodoro(WORK);
    } else {
      stopPomodoro();
    }
  }
  
  if (digitalRead(BTN_OK) == LOW) {
    lastButtonPress = currentMillis;
    Serial.println("🔘 Кнопка OK");
    
    // Отправить статус
    sendStatus();
  }
  
  if (digitalRead(BTN_CANCEL) == LOW) {
    lastButtonPress = currentMillis;
    Serial.println("🔘 Кнопка CANCEL");
    
    // Сбросить счётчики
    sittingStartTime = millis();
    sittingAlertSent = false;
    sendTelegramMessage("🔄 Счётчик сидения сброшен.");
  }
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

String formatTime(unsigned long ms) {
  int hours = ms / 3600000;
  int minutes = (ms % 3600000) / 60000;
  
  if (hours > 0) {
    return String(hours) + "ч " + String(minutes) + "м";
  } else {
    return String(minutes) + "м";
  }
}

String getMotionStatusString() {
  if (motion_detected) {
    return "Есть движение";
  } else if (isSitting) {
    return "Сидите";
  } else {
    return "Нет движения";
  }
}

// ============================================================================
// КОНЕЦ ПРОГРАММЫ
// ============================================================================
