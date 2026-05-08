#pragma once

// ============================================================
//  NEXIS Wellness Station — Конфигурация
//  Измените настройки WiFi и IP сервера под свою сеть!
// ============================================================

// ------------------------------------------------------------
//  WiFi — ИЗМЕНИТЕ НА СВОИ ДАННЫЕ
// ------------------------------------------------------------
#define WIFI_SSID       "YOUR_WIFI_SSID"       // Имя вашей Wi-Fi сети
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"   // Пароль Wi-Fi

// ------------------------------------------------------------
//  Сервер FastAPI — укажите IP компьютера в локальной сети
//  Узнать IP: Windows → cmd → ipconfig → IPv4 Address
// ------------------------------------------------------------
#define SERVER_HOST     "192.168.1.100"        // IP вашего ПК
#define SERVER_PORT     5000
#define API_DATA_URL    "http://" SERVER_HOST ":" TOSTRING(SERVER_PORT) "/api/data"
#define API_POMO_URL    "http://" SERVER_HOST ":" TOSTRING(SERVER_PORT) "/api/pomodoro"

#define TOSTRING_H(x)   #x
#define TOSTRING(x)     TOSTRING_H(x)

// ------------------------------------------------------------
//  Интервалы (мс)
// ------------------------------------------------------------
#define SENSOR_INTERVAL_MS      10000   // Чтение датчиков и отправка на сервер
#define DISPLAY_INTERVAL_MS     3000    // Смена экрана на LCD
#define ZM106_READ_INTERVAL_MS  5000    // Опрос ZM106-VOC по UART
#define WIFI_RECONNECT_MS       15000   // Попытка переподключения WiFi

// ------------------------------------------------------------
//  Пины — датчики
// ------------------------------------------------------------
#define PIN_DHT11       4       // DHT11 data (дополнительный T/H)
#define PIN_PIR         27      // PIR HC-SR501 (движение)
#define PIN_MQ135       36      // MQ-135 аналоговый ADC1 (доп. CO₂)
#define PIN_NOISE       39      // KY-037 аналоговый ADC1 (шум)

// ZM106-VOC UART (Serial2)
#define PIN_ZM106_RX    16
#define PIN_ZM106_TX    17
#define ZM106_BAUD      9600

// ------------------------------------------------------------
//  Пины — индикация и управление
// ------------------------------------------------------------
#define PIN_LED_R       13
#define PIN_LED_G       12
#define PIN_LED_B       14
#define PIN_BUZZER      25
#define PIN_BTN_MODE    32      // Кнопка Mode (смена экрана / режима)
#define PIN_BTN_OK      33      // Кнопка OK (запуск/стоп Pomodoro)

// ------------------------------------------------------------
//  I2C адреса
// ------------------------------------------------------------
#define I2C_SDA         21
#define I2C_SCL         22
#define I2C_BME280      0x76
#define I2C_BH1750      0x23
#define I2C_LCD         0x27

// ------------------------------------------------------------
//  Пороги алертов (должны совпадать с THRESHOLDS в main.py)
// ------------------------------------------------------------
#define THRESH_CO2_WARN     800
#define THRESH_CO2_DANGER   1200
#define THRESH_TEMP_WARN    27.0f
#define THRESH_TEMP_DANGER  30.0f
#define THRESH_HUM_WARN     65.0f
#define THRESH_HUM_DANGER   75.0f
#define THRESH_LIGHT_WARN   150
#define THRESH_LIGHT_DANGER 50
#define THRESH_NOISE_WARN   55
#define THRESH_NOISE_DANGER 70

// ------------------------------------------------------------
//  Pomodoro
// ------------------------------------------------------------
#define POMO_WORK_MIN   25
#define POMO_BREAK_MIN  5

// ------------------------------------------------------------
//  Шум — перевод АЦП → дБ (линейная аппроксимация)
//  KY-037 A0: 0 (тихо) … 4095 (громко)
//  Примерный диапазон 30–90 дБ
// ------------------------------------------------------------
#define NOISE_DB_MIN    30.0f
#define NOISE_DB_MAX    90.0f
