# NEXIS Wellness Station — Библиотека кодов

Все коды для Arduino IDE (ESP32). Каждый файл — самодостаточный, без внешних config.h.  
Перед прошивкой меняйте `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_HOST` на свои данные.

---

## Основные варианты прошивки

| Файл | Датчики | Когда использовать |
|------|---------|-------------------|
| [01_ПОЛНЫЙ_НАБОР.md](01_ПОЛНЫЙ_НАБОР.md) | BME280 + DHT11 + ZM106-VOC + MQ-135 + BH1750 + PIR + KY-037 + LCD + RGB + Buzzer + Buttons | Все компоненты собраны |
| [02_БЕЗ_VOC_С_MQ135.md](02_БЕЗ_VOC_С_MQ135.md) | BME280 + **MQ-135** + BH1750 + PIR + KY-037 + LCD + RGB + Buzzer + Buttons | Нет UART-датчика ZM106 |
| [03_БЕЗ_BME_С_DHT11.md](03_БЕЗ_BME_С_DHT11.md) | **DHT11** + BH1750 + PIR + KY-037 + LCD + RGB + Buzzer + Buttons | Нет BME280 (только T/H, без давления) |
| [04_BME_И_MQ135.md](04_BME_И_MQ135.md) | BME280 + **MQ-135** + BH1750 + PIR + KY-037 + LCD + RGB + Buzzer + Buttons | Рабочий минимум, без VOC и DHT11 |
| [05_NEXIS_UNIFIED.md](05_NEXIS_UNIFIED.md) | **Всё включено:** BME280 + MQ-135 + BH1750 + PIR + KY-037 + LCD + RGB + ESP32 WebServer + **Telegram бот** | Единый полный код — рекомендуется |

> **Вариант 05** — самый полный. Встроенный веб-дашборд, Telegram алерты, детальная диагностика, точка росы, heat index, Wellness-индекс. Используй для финальной демонстрации.

---

## Тестовые коды — один компонент

Используйте эти коды для проверки каждого датчика/устройства **по отдельности** перед сборкой полной схемы.

| Файл | Что проверяет | Библиотеки |
|------|--------------|-----------|
| [TEST_01_BME280.md](TEST_01_BME280.md) | Температура, влажность, давление (I2C 0x76) | Wire, Adafruit_BME280 |
| [TEST_02_BH1750.md](TEST_02_BH1750.md) | Освещённость в люксах (I2C 0x23) | Wire, BH1750 |
| [TEST_03_LCD1602.md](TEST_03_LCD1602.md) | Вывод текста на LCD 1602 (I2C 0x27) | Wire, LiquidCrystal_I2C |
| [TEST_04_PIR.md](TEST_04_PIR.md) | Датчик движения HC-SR501 + прерывание | — |
| [TEST_05_KY037_NOISE.md](TEST_05_KY037_NOISE.md) | Уровень шума ADC → дБ (GPIO39) | — |
| [TEST_06_RGB_LED.md](TEST_06_RGB_LED.md) | RGB светодиод — все цвета (GPIO13/12/14) | — |
| [TEST_07_BUZZER.md](TEST_07_BUZZER.md) | Зуммер — тоны и мелодии (GPIO25) | — |
| [TEST_08_BUTTONS.md](TEST_08_BUTTONS.md) | Кнопки MODE и OK + ISR дебаунс (GPIO32/33) | — |
| [TEST_09_DHT11.md](TEST_09_DHT11.md) | DHT11 температура и влажность (GPIO4) | DHT sensor library |
| [TEST_10_MQ135.md](TEST_10_MQ135.md) | MQ-135 аналоговый CO₂ (GPIO36 ADC1) | — |
| [TEST_11_ZM106_VOC.md](TEST_11_ZM106_VOC.md) | ZM106-VOC UART протокол, CRC (RX=16, TX=17) | — |
| [TEST_12_WIFI.md](TEST_12_WIFI.md) | Подключение к WiFi, вывод IP | WiFi.h |
| [TEST_13_HTTP_POST_SERVER.md](TEST_13_HTTP_POST_SERVER.md) | POST /api/data + GET /api/sensors на NEXIS сервер | WiFi, HTTPClient, ArduinoJson |
| [TEST_14_ESP32_WEBSERVER.md](TEST_14_ESP32_WEBSERVER.md) | ESP32 сам раздаёт дашборд (порт 80), `/api/sensors` без NEXIS сервера | WiFi, WebServer, BH1750, ArduinoJson |

---

## Пины — быстрая справка

| GPIO | Компонент | Питание |
|------|-----------|---------|
| 21 / 22 | I2C SDA / SCL | — |
| 4 | DHT11 | 3.3V |
| 27 | PIR HC-SR501 | 5V |
| 36 | MQ-135 (ADC1) | 5V |
| 39 | KY-037 шум (ADC1) | 3.3V |
| 16 / 17 | ZM106 RX / TX (Serial2) | 5V |
| 13 / 12 / 14 | RGB LED R / G / B | 3.3V + резисторы 220 Ом |
| 25 | Зуммер | 3.3V |
| 32 / 33 | Кнопка MODE / OK | INPUT_PULLUP |
| 21 / 22 (0x76) | BME280 | 3.3V |
| 21 / 22 (0x23) | BH1750 | 3.3V |
| 21 / 22 (0x27) | LCD 1602 | 5V |

## Пороги алертов

| Параметр | WARN | DANGER | Стандарт |
|---------|------|--------|---------|
| CO₂ | 800 ppm | 1200 ppm | ASHRAE 62.1 |
| Температура | 27°C | 30°C | ГОСТ 30494-2011 |
| Влажность | 65% | 75% | ГОСТ 30494-2011 |
| Освещённость | < 150 лк | < 50 лк | ГОСТ 30494-2011 |
| Шум | > 55 дБ | > 70 дБ | ГОСТ 12.1.003-83 |
